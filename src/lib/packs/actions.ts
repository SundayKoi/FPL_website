"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchCardEditionWeeks, fetchCardSeason, fetchEditionCards, fetchSeasonCards, fetchWeekMoments, type CardLeague } from "@/lib/cards/queries";
import { MOMENT_PULL_CHANCE, MOMENT_TIER, momentToCard } from "@/lib/cards/moments";
import { cardSlug, type PlayerCardData } from "@/lib/cards/build";
import { ALT_SKIN_CHANCE, PACK_COST, SIGNED_ALT_SKIN_CHANCE } from "./config";
import { rollPack } from "./rng";
import { applyAutographs } from "./signatures";
import { fetchChampionSkinNums, printArtExists, rollPrint } from "./skins";
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
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong opening that pack.";
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
export async function openPackAction(
  league: CardLeague,
  /** Which week's cards to mint. Omitted (or unarchived) means the current
   *  live ratings. Every archived week stays purchasable forever — no
   *  edition is ever closed off. */
  requestedWeek?: string,
): Promise<
  | { ok: true; cards: { card: PlayerCardData; foil: boolean; signed: boolean; inventoryId: number }[]; balance: number }
  | { ok: false; error: string }
> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

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
  const weeks = await fetchCardEditionWeeks(service, season);
  const editionWeek = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : weeks[0] ?? null;
  if (requestedWeek && !weeks.includes(requestedWeek)) {
    return { ok: false, error: "That week isn't available yet." };
  }

  const cards = editionWeek
    ? await fetchEditionCards(service, season, editionWeek)
    : await fetchSeasonCards(service, season);
  if (cards.length === 0) return { ok: false, error: "No cards to open yet — check back once games are played." };

  const { data: openId, error: openError } = await service.rpc("open_card_pack", {
    p_user: user.discordId,
    p_season: season,
    p_cost: PACK_COST,
  });
  if (openError) return { ok: false, error: friendlyOpenPackError(openError.message) };

  // CSPRNG, not Math.random: V8's PRNG state is recoverable from observed
  // outputs, and pack contents gate real (betting-dollar) value. Six bytes
  // over 2^48 gives a uniform [0,1) with more than enough resolution for
  // the roll tables.
  const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
  // Roll the pack, then ink it: the autograph pass rides the same CSPRNG so
  // a signed pull is as unguessable as the pull itself.
  const pulls = applyAutographs(rollPack(cards, rand), await fetchSignatures(service, season), rand);

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
      // Replaces the last slot rather than lengthening the pack: five cards
      // is the pack, and a sixth would make the moment a bonus instead of
      // the thing you got instead of a card.
      pulls[pulls.length - 1] = {
        card: momentToCard(moment, season),
        foil: false,
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
    // signature it was pulled with even if the player redraws it later
    const card: PlayerCardData = { ...pull.card, autograph: pull.autograph };
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
        discord_id: user.discordId,
        season,
        slug: print.card.slug,
        player_name: print.card.name,
        role: print.card.role,
        edition_week: stampedWeek,
        overall: print.card.overall,
        // "moment" rather than the placeholder tier the wrapper carries:
        // this column is what dust pricing and the ledger read, and a
        // moment filed as gold would dust as an ordinary gold card.
        tier: print.card.moment ? MOMENT_TIER : print.card.tier.key,
        foil: print.foil,
        signed: print.signed,
        // the whole card, frozen: ratings restat nightly, collections don't
        // — and the autograph and rolled art ride along with it
        card: print.card,
        pack_open_id: openId,
      })),
    )
    .select("id");

  if (insertError || !inserted) {
    const { error: refundError } = await service.rpc("refund_card_pack", { p_open: openId });
    if (refundError) {
      // Money is out and the cards never landed — say nothing about a refund
      // we can't stand behind, and leave a trail for whoever reconciles it.
      console.error("packs: refund_card_pack failed", { openId, refundError, insertError });
      return { ok: false, error: "That pack didn't open and we couldn't reverse the charge — staff have been notified." };
    }
    return { ok: false, error: "That pack didn't open — you haven't been charged." };
  }

  // Read the balance back rather than subtracting locally: the wallet may
  // have moved for other reasons (a bet settling) while this ran.
  const { data: profile } = await service
    .from("betting_profiles")
    .select("balance")
    .eq("discord_id", user.discordId)
    .single();

  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");

  const ids = (inserted as { id: number }[]).map((row) => row.id);
  return {
    ok: true,
    cards: prints.map((print, index) => ({
      // the frozen copy, not the live card: the reveal shows the ink and the
      // print this pull actually rolled
      card: print.card,
      foil: print.foil,
      signed: print.signed,
      inventoryId: ids[index],
    })),
    balance: (profile as { balance: number } | null)?.balance ?? user.balance - PACK_COST,
  };
}
