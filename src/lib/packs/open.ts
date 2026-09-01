import { randomBytes } from "node:crypto";
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardEditionWeeks, fetchCardSeason, fetchCurrentWeekCards, fetchEditionCards, fetchTeamIdentity, fetchWeekMoments, type CardLeague } from "@/lib/cards/queries";
import {
  CHAMPIONS_LOGO_PATH,
  CHAMPIONS_PACK_COST,
  CHAMPION_FOIL_CHANCE,
  CHAMPION_SIGNED_CHANCE,
  CHAMPION_TIER,
  championToCard,
  rollChampionCard,
} from "@/lib/cards/champions";
import { MOMENT_PULL_CHANCE, MOMENT_TIER, momentToCard } from "@/lib/cards/moments";
import { buildTeamCards, TEAM_PULL_CHANCE, TEAM_TIER, teamCardSlug, teamToCard } from "@/lib/cards/teamCards";
import { cardSlug, type PlayerCardData } from "@/lib/cards/build";
import { ALT_SKIN_CHANCE, DEFAULT_FOIL_TYPE, FOIL_CHANCE, FOIL_TYPE_LABELS, foilTypeOf, LIVE_FOIL_CHANCE, PACK_COST, rollFoilType, SIGNED_ALT_SKIN_CHANCE } from "./config";
import { matchesChase, type ChaseCriteria } from "./chase";
import { GOLD, postCardsWebhook } from "./announce";
import { rollPack } from "./rng";
import { applyAutographs } from "./signatures";
import { fetchChampionSkinNums, printArtExists, rollPrint, splashArtExists } from "./skins";
import { mondayOf } from "./week";

/** slug -> that player's inked signature, for everyone in `season` who has
 *  drawn one. Read through the service client (card_art_prefs is publicly
 *  readable, but this action already holds one). A failure — the signature
 *  migration not applied to this environment — yields an empty map: nobody
 *  rolls an autograph, and the pack opens normally. */
async function fetchSignatures(
  service: ReturnType<typeof createBettingServiceClient>,
  season: string,
): Promise<Map<string, string>> {
  const { data, error } = await service
    .from("card_art_prefs")
    .select("summoner_name, tag, signature")
    .eq("season", season)
    .not("signature", "is", null);
  if (error) return new Map();
  const rows = (data as { summoner_name: string; tag: string; signature: string | null }[]) ?? [];
  return new Map(
    rows
      .filter((row): row is { summoner_name: string; tag: string; signature: string } => Boolean(row.signature))
      .map((row) => [cardSlug(row.summoner_name, row.tag), row.signature]),
  );
}

/** `open_card_pack`'s raw `raise exception` text → friendly copy. Same
 *  contract as friendlyPlaceBetError: never surface a raw Postgres error. */
function friendlyOpenPackError(message: string): string {
  if (/insufficient balance/i.test(message)) return "Insufficient balance.";
  if (/cost must be positive/i.test(message)) return "That pack isn't for sale right now.";
  if (/already ripped/i.test(message)) return "You've already ripped today — come back tomorrow.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong opening that pack.";
}

/** Spend one comp by compare-and-swap (PostgREST can't decrement in
 *  place): read the count, update only if it still holds. A lost race
 *  retries once against the new count; two clicks can never spend one
 *  comp twice. Returns the remaining count after spending, or null when
 *  no comp was held.
 *
 *  `kind` is the shelf the comp buys from: "champions" for the Faceless
 *  Drop's tribute, "standard" for the shop pack the Weekly Draw pays out.
 *  select("*") rather than a column list, for deploy-before-migration
 *  tolerance — same as the shop's other comps reads. */
export async function spendPackComp(
  service: SupabaseClient,
  discordId: string,
  kind: string,
): Promise<number | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: compRow } = await service
      .from("card_pack_comps")
      .select("*")
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .maybeSingle();
    const held = (compRow as { remaining?: number } | null)?.remaining ?? 0;
    if (held <= 0) return null;
    const { data: spent } = await service
      .from("card_pack_comps")
      .update({ remaining: held - 1 })
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .eq("remaining", held)
      .select("remaining");
    if (spent && spent.length > 0) return held - 1;
  }
  return null;
}

/** Hand one comp back the same compare-and-swap way it was spent, after a
 *  fulfilment that failed. `false` means it is still gone and someone has
 *  to restore it by hand — every caller says that out loud rather than
 *  promising a return it can't stand behind. A missing row is a refusal,
 *  not an insert: minting a comp out of an error is worse than losing one.
 */
export async function refundPackComp(
  service: SupabaseClient,
  discordId: string,
  kind: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: compRow } = await service
      .from("card_pack_comps")
      .select("*")
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .maybeSingle();
    const held = (compRow as { remaining?: number } | null)?.remaining;
    if (held === undefined) return false;
    const { data: restored } = await service
      .from("card_pack_comps")
      .update({ remaining: held + 1 })
      .eq("discord_id", discordId)
      .eq("kind", kind)
      .eq("remaining", held)
      .select("remaining");
    if (restored && restored.length > 0) return true;
  }
  return false;
}

/**
 * Buys and opens one pack for the signed-in caller.
 *
 * Only the league travels over the wire — the Discord id comes from the
 * session and the price from config.ts, both server-side, so a client can
 * neither open someone else's pack nor name its own price.
 *
 * Charge first, fulfill after: `open_card_pack` debits the wallet and hands
 * back an open id, the pulled cards are then written to card_inventory, and
 * a failed write is reversed with `refund_card_pack` — the same
 * compensating-transaction shape the store's buy flow uses (handleBuy in
 * src/lib/betting/discord/commands.ts). The alternative — rolling first and
 * charging after — would hand out free cards whenever the debit failed.
 */
export type OpenPackResult =
  | {
      ok: true;
      cards: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean; inventoryId: number }[];
      balance: number;
      /** The archived week this pack minted from, or null when it fell back
       *  to the live cards. A pull is FROM a week, and anything picturing it
       *  has to say which — see the share PNG's `?w=`. */
      editionWeek: string | null;
      /** Set on a daily rip: consecutive Eastern days ripped, and the
       *  betting-dollar bonus this rip paid (0 except every 7th day). */
      streak?: number;
      streakBonus?: number;
      /** Set when this open spent a comp (a free pack): how many the
       *  holder has left afterwards. */
      compsLeft?: number;
    }
  | { ok: false; error: string };

/**
 * Everything after authorization, shared by the web actions above and the
 * Discord /rip handler (src/lib/betting/discord/rip.ts) — an interactions
 * webhook has no cookie session, so the caller supplies the Discord id it
 * verified itself.
 */
export async function openPackFor(
  discordId: string,
  league: CardLeague,
  opts: { requestedWeek?: string; daily?: boolean; fallbackBalance?: number } = {},
): Promise<OpenPackResult> {
  const { requestedWeek, daily = false } = opts;
  const service = createBettingServiceClient();

  // Resolve the pool BEFORE charging: a season with no cards has to be an
  // error the user never pays for (same reasoning as handleBuy fetching the
  // store item before start_purchase).
  const season = await fetchCardSeason(service, league);
  if (!season) return { ok: false, error: "No season is set up for packs yet." };

  // Which edition this pack mints. An archived week is drawn from the
  // archive and stamped with that exact week; with no archive at all the
  // pack falls back to the live cards. That pairing is what closes the old
  // vintage gap — the stamp used to be "whatever Monday it is today", so
  // two packs opened either side of an ingest could carry the same edition
  // label with different ratings.
  // Three reads that only need `season`, started together rather than one
  // after another. They were sequential — the archive list, then the pool,
  // then the live-drop window, then the signature book — and each is a
  // round trip to Supabase on the path between a click and five cards.
  //
  // The live window is deliberately still read ONCE per open: reading it
  // earlier changes nothing about the honest answer (a window closing
  // mid-pack keeps whichever side of the boundary the read landed on), and
  // it is read before the charge either way.
  const [weeks, liveRowResult, signatures] = await Promise.all([
    fetchCardEditionWeeks(service, season),
    service.from("league_settings").select("live_until, live_label").eq("id", 1).maybeSingle(),
    fetchSignatures(service, season),
  ]);
  const editionWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[0] ?? null;
  if (requestedWeek && !weeks.includes(requestedWeek)) {
    return { ok: false, error: "That week isn't available yet." };
  }

  // The archive is what an edition pack mints from — that is what makes a
  // week's pack that week's cards, and it is untouched here. The fallback
  // is for a season with nothing archived yet, and it follows the hub.
  const cards = editionWeek
    ? await fetchEditionCards(service, season, editionWeek)
    : await fetchCurrentWeekCards(service, season);
  if (cards.length === 0) return { ok: false, error: "No cards to open yet — check back once games are played." };

  // Daily rips claim through their own RPC: open_card_pack rejects a zero
  // cost by design, and the day limit / streak live server-side where a
  // retried request can't double-claim them.
  //
  // A comped pack skips the charge RPC entirely rather than charging zero
  // (open_card_pack refuses a zero cost), so `openId` stays null and the
  // cards below are stamped against no paid open — the same shape a comped
  // Faceless Pack has.
  let openId: number | null = null;
  let streak: number | undefined;
  let streakBonus: number | undefined;
  // Free shop packs — the Weekly Draw pays one out with the pot. Spent
  // before the charge so a holder is never debited, and never on a daily
  // rip: that one is already free, and spending a comp on it would burn
  // the prize for nothing.
  let compRemaining: number | null = null;
  if (daily) {
    const { data, error: openError } = await service.rpc("open_daily_pack", {
      p_user: discordId,
      p_season: season,
    });
    if (openError) return { ok: false, error: friendlyOpenPackError(openError.message) };
    const row = (Array.isArray(data) ? data[0] : data) as { open_id: number; streak: number; bonus: number };
    openId = row.open_id;
    streak = row.streak;
    streakBonus = row.bonus;
  } else {
    compRemaining = await spendPackComp(service, discordId, "standard");
    if (compRemaining === null) {
      const { data, error: openError } = await service.rpc("open_card_pack", {
        p_user: discordId,
        p_season: season,
        p_cost: PACK_COST,
      });
      if (openError) return { ok: false, error: friendlyOpenPackError(openError.message) };
      openId = data as number;
    }
  }
  const usedComp = compRemaining !== null;

  // CSPRNG, not Math.random: V8's PRNG state is recoverable from observed
  // outputs, and pack contents gate real (betting-dollar) value. Six bytes
  // over 2^48 gives a uniform [0,1) with more than enough resolution for
  // the roll tables.
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  // Roll the pack, then ink it: the autograph pass rides the same CSPRNG so
  // a signed pull is as unguessable as the pull itself.
  // Live Drops: while the admin's window is open, foil rolls at the
  // boosted rate and every card in the pack takes the LIVE stamp. Read
  // once per open; a window closing mid-pack keeps whichever side of the
  // boundary the read landed on, which is the only honest answer.
  const liveSettings = liveRowResult.data as { live_until: string | null; live_label: string | null } | null;
  const liveNow = Boolean(liveSettings?.live_until && new Date(liveSettings.live_until).getTime() > Date.now());
  const liveLabel = liveNow ? liveSettings?.live_label?.trim() || "Live drop" : null;

  const pulls = applyAutographs(
    rollPack(cards, rand, liveNow ? LIVE_FOIL_CHANCE : FOIL_CHANCE),
    signatures,
    rand,
  );

  // A moment can only come out of the week it happened in — that is what
  // ties the print to the performance, and it is why an edition pack is
  // worth buying for a specific week rather than always the newest.
  //
  // Rolled once for the whole PACK, not per card: at MOMENT_PULL_CHANCE
  // roughly one pack in fifty carries one, and a week that minted two has
  // them competing for that single slot rather than each rolling its own.
  // The roll happens after the autograph pass so the earlier stages'
  // consumption of `rand` is untouched.
  if (editionWeek) {
    const weekMoments = await fetchWeekMoments(service, season, editionWeek);
    if (weekMoments.length > 0 && rand() < MOMENT_PULL_CHANCE) {
      const moment = weekMoments[Math.floor(rand() * weekMoments.length)];
      // Which mint of this moment the copy is. A plain count, not an
      // atomic claim: two same-second pulls could both stamp the same
      // serial, and a shared "3rd mint" is a story, not a wallet bug.
      const { count } = await service
        .from("card_inventory")
        .select("id", { count: "exact", head: true })
        .eq("season", season)
        .eq("slug", `moment-${moment.id}`);
      // Replaces the last slot rather than lengthening the pack: five cards
      // is the pack, and a sixth would make the moment a bonus instead of
      // the thing you got instead of a card.
      pulls[pulls.length - 1] = {
        card: momentToCard(moment, season, (count ?? 0) + 1),
        foil: false,
        foilType: null,
        signed: false,
        autograph: null,
      };
    }
  }

  // A roster plate, from the SAME edition the pack mints. The live team
  // page rebuilds every week off the newest ratings; a pulled copy is a
  // snapshot of this week's champions, overalls and roster, which is what
  // makes an edition pack worth opening for a particular week.
  //
  // Rolled once per pack like the moment above, and only when the moment
  // roll didn't already claim the slot — two relics in one pack would make
  // the rarer one feel cheap.
  if (editionWeek && !pulls[pulls.length - 1].card.moment && rand() < TEAM_PULL_CHANCE) {
    const identity = await fetchTeamIdentity(service, season);
    const teams = buildTeamCards(cards, identity.colors, editionWeek);
    if (teams.length > 0) {
      const entry = teams[Math.floor(rand() * teams.length)];
      const { count } = await service
        .from("card_inventory")
        .select("id", { count: "exact", head: true })
        .eq("season", season)
        .eq("slug", teamCardSlug(entry.teamName, editionWeek));
      // A plate shines like any other card — same foil odds, same
      // parallels — so a foiled roster is a real chase.
      const plateFoil = rand() < (liveNow ? LIVE_FOIL_CHANCE : FOIL_CHANCE);
      pulls[pulls.length - 1] = {
        card: teamToCard(entry, season, (count ?? 0) + 1),
        foil: plateFoil,
        foilType: plateFoil ? rollFoilType(rand) : null,
        signed: false,
        autograph: null,
      };
    }
  }

  // Pack prints roll their own art: every copy freezes a random skin of the
  // player's signature champion, so opening the same player twice gives you
  // two different prints. The player's chosen skin still drives their live
  // card everywhere else — only these frozen copies are rolled. The rolls
  // run after the autograph pass so the earlier stages' rand consumption is
  // untouched. Catalogs are fetched per unique champion first: five pulls of
  // one player must not open five requests before the cache is warm.
  const champions = [
    ...new Set(
      pulls
        .map((pull) => pull.card.signature?.champion)
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const skinNums = new Map(
    await Promise.all(champions.map(async (champion) => [champion, await fetchChampionSkinNums(champion)] as const)),
  );
  // rollPrint (not rollSkinNum): the catalog lists nums whose centered art
  // was never uploaded, and a print frozen against a 403 renders as base —
  // validation happens here, before the copy is written. Sequential on
  // purpose: five pulls of one champion then share the validity cache
  // instead of racing duplicate HEAD requests.
  const prints = [];
  for (const pull of pulls) {
    const champion = pull.card.signature?.champion;
    // the autograph rides inside the card too, so this copy keeps the
    // signature it was pulled with even if the player redraws it later —
    // and the LIVE stamp rides the same way, frozen at mint.
    const card: PlayerCardData = {
      ...pull.card,
      autograph: pull.autograph,
      ...(liveLabel && !pull.card.moment ? { live: { label: liveLabel } } : {}),
    };
    if (!champion) {
      prints.push({ ...pull, card });
      continue;
    }
    // Signed copies roll alternate art on their own, rarer gate — the
    // signed + foil + alt print is the chase.
    const artSkin = await rollPrint(
      champion,
      skinNums.get(champion) ?? [0],
      rand,
      printArtExists,
      pull.signed ? SIGNED_ALT_SKIN_CHANCE : ALT_SKIN_CHANCE,
    );
    prints.push({ ...pull, card: { ...card, artSkin } });
  }

  const stampedWeek = editionWeek ?? mondayOf(new Date());
  const { data: inserted, error: insertError } = await service
    .from("card_inventory")
    .insert(
      prints.map((print) => ({
        discord_id: discordId,
        season,
        slug: print.card.slug,
        player_name: print.card.name,
        role: print.card.role,
        edition_week: stampedWeek,
        overall: print.card.overall,
        // "moment" rather than the placeholder tier the wrapper carries:
        // this column is what dust pricing and the ledger read, and a
        // moment filed as gold would dust as an ordinary gold card.
        tier: print.card.moment ? MOMENT_TIER : print.card.team ? TEAM_TIER : print.card.tier.key,
        foil: print.foil,
        foil_type: print.foilType,
        signed: print.signed,
        // the whole card, frozen: ratings restat nightly, collections don't
        // — and the autograph and rolled art ride along with it
        card: print.card,
        pack_open_id: openId,
      })),
    )
    .select("id");

  if (insertError || !inserted) {
    if (usedComp) {
      // No money moved, so there is nothing for refund_card_pack to reverse
      // — the comp is what has to go back, the same CAS way it was spent.
      if (!(await refundPackComp(service, discordId, "standard"))) {
        console.error("packs: comp restore failed (standard)", { discordId, insertError });
        return { ok: false, error: "That pack didn't open and the free pack couldn't be returned — staff have been notified." };
      }
      return { ok: false, error: "That pack didn't open — your free pack wasn't spent." };
    }
    const { error: refundError } = await service.rpc("refund_card_pack", { p_open: openId });
    if (refundError) {
      // Money is out and the cards never landed — say nothing about a refund
      // we can't stand behind, and leave a trail for whoever reconciles it.
      console.error("packs: refund_card_pack failed", { openId, refundError, insertError });
      return { ok: false, error: "That pack didn't open and we couldn't reverse the charge — staff have been notified." };
    }
    return { ok: false, error: "That pack didn't open — you haven't been charged." };
  }

  const ids = (inserted as { id: number }[]).map((row) => row.id);

  // The Weekly Chase. Checked AFTER the insert on purpose: the claim pays a
  // bounty, and claiming before the cards exist would need un-claiming on
  // an insert failure — a compensation path with money in it. This order's
  // worst case is benign: a crash between insert and claim leaves the
  // chase open for the next matching pack.
  //
  // The database's atomic update decides who was first; this only asks
  // "does one of these prints qualify". The loser of a same-second race
  // keeps an unstamped card, which is exactly what second place is.
  if (editionWeek) {
    // By week alone — the chase is league-wide. An academy pull matching
    // the criteria wins the same bounty a premier pull would; the atomic
    // claim below still guarantees exactly one winner across both.
    const { data: chaseRow } = await service
      .from("card_chases")
      .select("id, title, bounty, criteria")
      .eq("week", editionWeek)
      .is("claimed_by", null)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    const chase = chaseRow as { id: number; title: string; bounty: number; criteria: ChaseCriteria } | null;
    if (chase) {
      const hitIndex = prints.findIndex((print) =>
        matchesChase({ card: print.card, foil: print.foil, foilType: print.foilType, signed: print.signed }, chase.criteria ?? {}),
      );
      if (hitIndex !== -1) {
        const { data: won } = await service.rpc("claim_card_chase", { p_chase: chase.id, p_user: discordId });
        if (won === true) {
          const stamped: PlayerCardData = { ...prints[hitIndex].card, chase: { title: chase.title } };
          prints[hitIndex] = { ...prints[hitIndex], card: stamped };
          // The stamp goes into the stored copy too — the returned reveal
          // and the shelf must show the same object.
          await service
            .from("card_inventory")
            .update({ card: stamped })
            .eq("id", ids[hitIndex]);
          await service
            .from("card_chases")
            .update({ claimed_inventory_id: ids[hitIndex] })
            .eq("id", chase.id);
          await announceChaseClaim(service, discordId, chase.title, prints[hitIndex], chase.bounty);
        }
      }
    }
  }

  // Read the balance back rather than subtracting locally: the wallet may
  // have moved for other reasons (a bet settling) while this ran.
  const { data: profile } = await service
    .from("betting_profiles")
    .select("balance")
    .eq("discord_id", discordId)
    .single();

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");

  return {
    ok: true,
    cards: prints.map((print, index) => ({
      // the frozen copy, not the live card: the reveal shows the ink and the
      // print this pull actually rolled
      card: print.card,
      foil: print.foil,
      // The reveal has to know which parallel to draw — without it every
      // pull would flash up as a Prisma and the chase would land silently.
      foilType: print.foilType,
      signed: print.signed,
      inventoryId: ids[index],
    })),
    balance: (profile as { balance: number } | null)?.balance ?? opts.fallbackBalance ?? 0,
    editionWeek,
    streak,
    streakBonus,
    // Free packs left after this open, when one paid for it — the shop
    // keeps its counter honest with it.
    ...(usedComp ? { compsLeft: compRemaining ?? 0 } : {}),
  };
}

/**
 * Tells the Discord cards channel a chase fell. Best-effort via
 * postCardsWebhook: the claim and the bounty are already committed, and an
 * outage must not fail a pack someone just won something out of.
 */
async function announceChaseClaim(
  service: ReturnType<typeof createBettingServiceClient>,
  discordId: string,
  title: string,
  print: { card: PlayerCardData; foil: boolean; foilType: string | null; signed: boolean },
  bounty: number,
): Promise<void> {
  const { data } = await service
    .from("betting_profiles")
    .select("username, patron_until")
    .eq("discord_id", discordId)
    .maybeSingle();
  const row = data as { username: string; patron_until: string | null } | null;
  // Patrons carry the flame into the announcement too — the perk is being
  // seen, and this embed is the most-seen line the cards channel has.
  const burning = Boolean(row?.patron_until && new Date(row.patron_until).getTime() > Date.now());
  const who = `${burning ? "🔥 " : ""}${row?.username ?? "Someone"}`;
  const { card } = print;
  // Spell out what the winning pull actually WAS. The share image can't
  // show foil or ink, so without this line a subtle Prisma claim reads as
  // "that card isn't even foil" to everyone watching the channel.
  const traits = [
    `${card.tier.label} ${card.role}`,
    ...(print.foil ? [`✨ ${FOIL_TYPE_LABELS[foilTypeOf(print.foilType)]}`] : []),
    ...(print.signed ? ["✍️ Signed"] : []),
  ].join(" · ");
  // The card itself rides the embed, via the share renderer the site
  // already serves. SITE_URL missing just drops the picture, not the news.
  const site = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  await postCardsWebhook({
    title: "🏆 The chase has fallen",
    description: `**${who}** pulled it: ${title}\n${card.name} — ${card.overall} OVR · ${traits}${bounty > 0 ? `\nBounty: **+${bounty}**` : ""}`,
    color: GOLD,
    ...(site ? { image: { url: `${site}/card/${card.slug}/card.png` } } : {}),
  });
}

/**
 * The Faceless Drop: buys ONE card of the S4 champions' Dealer's Hand.
 *
 * Same skeleton as openPackFor — charge through open_card_pack, fulfill,
 * refund on a failed write — but the pool is the five-card set and the
 * window on league_settings is the whole gate. Premier only: the Hand is
 * a premier title.
 *
 * Autographs are REAL INK ONLY: the roll happens solely when the
 * champion's drawn signature exists under the account the title was won
 * on (any season — same account is the site's own definition of the same
 * person). Two of the five can't currently sign, and a printed script
 * signature for someone who never held the pen isn't an autograph.
 */
export async function openChampionsPack(
  discordId: string,
  opts: { fallbackBalance?: number } = {},
): Promise<OpenPackResult> {
  const service = createBettingServiceClient();

  // select("*") for deploy-before-migration tolerance, same as the shop's
  // settings reads.
  const { data: settingsRow } = await service
    .from("league_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const until = (settingsRow as { champions_until?: string | null } | null)?.champions_until ?? null;
  if (!until || new Date(until).getTime() <= Date.now()) {
    return { ok: false, error: "The Faceless Drop isn't open." };
  }

  const season = await fetchCardSeason(service, "premier");
  if (!season) return { ok: false, error: "No season is set up for packs yet." };

  // The Champion's Tribute: squad members hold free Faceless Packs. On
  // exhausted comps this falls through to the normal charge.
  const compRemaining = await spendPackComp(service, discordId, "champions");
  const usedComp = compRemaining !== null;

  let openId: number | null = null;
  if (!usedComp) {
    const { data: openData, error: openError } = await service.rpc("open_card_pack", {
      p_user: discordId,
      p_season: season,
      p_cost: CHAMPIONS_PACK_COST,
    });
    if (openError) return { ok: false, error: friendlyOpenPackError(openError.message) };
    openId = openData as number;
  }

  // Same CSPRNG discipline as the shop: pack contents gate real value.
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  const def = rollChampionCard(rand);
  const foilRolled = rand() < CHAMPION_FOIL_CHANCE;
  // Rolled only when foil hit, preserving the conditional-consumption
  // pattern rng.ts established.
  const rolledType = foilRolled ? rollFoilType(rand) : null;

  const { data: inkRows } = await service
    .from("card_art_prefs")
    .select("signature, season")
    .eq("summoner_name", def.riot.summoner)
    .eq("tag", def.riot.tag)
    .not("signature", "is", null)
    .order("season", { ascending: false })
    .limit(1);
  const ink = ((inkRows as { signature: string | null }[] | null) ?? [])[0]?.signature ?? null;
  const signed = Boolean(ink) && rand() < CHAMPION_SIGNED_CHANCE;
  // A signed relic always prints foil, same rule as player cards
  // (signatures.ts): real ink on a matte card reads as a downgrade. A
  // signed copy that didn't roll its own parallel gets the base Prisma;
  // dust is unaffected either way — champions foil is inert.
  const foil = foilRolled || signed;
  const foilType = rolledType ?? (signed ? DEFAULT_FOIL_TYPE : null);

  // Alt art rolls at the player-card gates (rarer on signed copies) over
  // the most-played champion's skin catalog — validated against the
  // REGULAR splash directory, the only one this card's renderer draws
  // from, so a frozen print can never point at art the CDN doesn't serve.
  const skinNums = await fetchChampionSkinNums(def.champion);
  const artSkin = await rollPrint(
    def.champion,
    skinNums,
    rand,
    splashArtExists,
    signed ? SIGNED_ALT_SKIN_CHANCE : ALT_SKIN_CHANCE,
  );

  // Which mint of this rank the copy is. A plain count, same contract as
  // moment serials: a same-second tie shares a number and that's a story,
  // not a wallet bug.
  const { count } = await service
    .from("card_inventory")
    .select("id", { count: "exact", head: true })
    .eq("season", season)
    .eq("slug", `faceless-${def.rank.toLowerCase()}`);

  const card: PlayerCardData = {
    ...championToCard(def, season, (count ?? 0) + 1),
    // Pinned to the committed asset — a relic never depends on a team row.
    teamImageUrl: CHAMPIONS_LOGO_PATH,
    artSkin,
    ...(signed && ink ? { autograph: ink } : {}),
  };

  const { data: inserted, error: insertError } = await service
    .from("card_inventory")
    .insert({
      discord_id: discordId,
      season,
      slug: card.slug,
      player_name: card.name,
      role: card.role,
      edition_week: mondayOf(new Date()),
      overall: 0,
      tier: CHAMPION_TIER,
      foil,
      foil_type: foilType,
      signed,
      card,
      pack_open_id: openId,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    if (usedComp) {
      // Hand the comp back the same CAS way it was spent — best effort,
      // and loud when it fails, because a lost comp is a support ticket.
      if (!(await refundPackComp(service, discordId, "champions"))) {
        console.error("packs: comp restore failed (champions)", { discordId, insertError });
        return { ok: false, error: "That pack didn't open and the free pack couldn't be returned — staff have been notified." };
      }
      return { ok: false, error: "That pack didn't open — your free pack wasn't spent." };
    }
    const { error: refundError } = await service.rpc("refund_card_pack", { p_open: openId });
    if (refundError) {
      console.error("packs: refund_card_pack failed (champions)", { openId, refundError, insertError });
      return { ok: false, error: "That pack didn't open and we couldn't reverse the charge — staff have been notified." };
    }
    return { ok: false, error: "That pack didn't open — you haven't been charged." };
  }

  const { data: profile } = await service
    .from("betting_profiles")
    .select("balance")
    .eq("discord_id", discordId)
    .single();

  revalidatePath("/cards/packs");

  return {
    ok: true,
    // A Champions relic is minted live rather than drawn from an archived
    // week, so there is no edition for a picture to ask for.
    editionWeek: null,
    cards: [
      {
        card,
        foil,
        foilType,
        signed,
        inventoryId: (inserted as { id: number }).id,
      },
    ],
    balance: (profile as { balance: number } | null)?.balance ?? opts.fallbackBalance ?? 0,
    // Free packs left after this open, when the holder has any — the shop
    // keeps its tribute banner honest with it.
    ...(usedComp ? { compsLeft: compRemaining ?? 0 } : {}),
  };
}
