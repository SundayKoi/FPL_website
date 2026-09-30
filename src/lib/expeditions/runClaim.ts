import "server-only";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchInventoryByIds } from "@/lib/packs/queries";
import { easternDateOf } from "@/lib/packs/week";
import { fetchEditionCards } from "@/lib/cards/queries";
import { GOLD, LIVE_RED, postCardsWebhook } from "@/lib/packs/announce";
import {
  ECHO_CHANCE,
  EXPEDITION_TIERS,
  HARVEST_MERCHANT,
  MERCHANT_DOLLARS,
  SURGE_BONUS,
  ransomFor,
  rollOutcome,
  type CardCopy,
  type ExpeditionOutcome,
  type ExpeditionTierKey,
} from "./config";
import { fetchAtlasRuns, fetchCamp, fetchCampaign, fetchFixturesSince, fetchStrangersHolds } from "./queries";
import { hasTrail, roadOf, type AtlasStamp } from "./runRows";
import { convoySheet } from "./convoy";
import { EDGE_TITLE, choiceSheet, forksFor, resolveRoute, type RouteResult } from "./routes";
import { ARCHETYPE_RULES, activeAbilities, traitsOf } from "./archetypes";
import { echoPool, surgeTeams, teamsPlayingOn } from "./matchday";
import { STRANDED_BOUNTY, encountersFor } from "./journal";
import { fetchCompany } from "./companyReads";
import { CAMPAIGNS, nextRoad, relicBearer, type CampaignState, type StageLog } from "./campaigns";
import { watchWeeksOf, weatherOfRun } from "./weather";
import { ROAD_REWARDS, atlasFor, atlasStamp, firstNamedLine, placeTitle, rewardWords, roadComplete, routeName } from "./atlas";
import {
  DAY_MS,
  convoyPartner,
  expeditionRand,
  friendlyExpeditionError,
  readRun,
  type BettingServiceClient,
  type ClaimAtlas,
  type ClaimResult,
  type RansomResult,
} from "./runShared";

// Bringing a squad home (the roll, the route, the write and the news), and
// buying a lost card back (runs.ts is the barrel; the header there says
// why all of this is `server-only`).

/**
 * Brings a finished squad home: rolls the outcome, walks the route, banks
 * it all, and — for the results rare enough to be news — tells the cards
 * channel.
 *
 * The roll happens HERE and the RPC writes it once, which is the whole
 * anti-reroll design: `claimed_at` is the lock, so a second claim of the
 * same run raises rather than rolling again. The pre-checks below are
 * courtesy (a clear message instead of a translated exception); the RPC
 * re-checks both under `for update`, which is what a double-click races.
 */
export async function claimExpeditionFor(discordId: string, runId: number): Promise<ClaimResult> {
  if (!Number.isInteger(runId)) return { ok: false, error: friendlyExpeditionError("unknown run") };

  const { run, season, error } = await readRun(discordId, runId);
  if (error) return { ok: false, error: "Couldn't read that expedition — try again." };
  if (!run || run.tier === "lost") return { ok: false, error: friendlyExpeditionError("unknown run") };
  if (run.claimedAt) return { ok: false, error: friendlyExpeditionError("already claimed") };
  if (new Date(run.resolvesAt).getTime() > Date.now()) {
    return { ok: false, error: friendlyExpeditionError("expedition still out") };
  }
  const tier = run.tier;

  const service = createBettingServiceClient();
  const squad = run.squad;
  // Only the roles are wanted (the brief), and the shine was frozen into
  // the row at launch — re-deriving it here would let a card signed or
  // re-graded mid-run change a payout the player already committed to.
  const copies: CardCopy[] = await fetchInventoryByIds(service, discordId, squad);
  // A deployed copy cannot be melted or traded away — card_inventory_
  // expedition_guard refuses both while the run is unclaimed — so all
  // three are still there and still this caller's, and a short read is
  // ALWAYS a failed query (fetchInventoryByIds fails soft to []) or
  // corruption, never a legitimate state. Rolling anyway would quietly
  // cost a real payout its 20% brief bonus, because briefHit is a
  // `copies.some(...)` over roles that an empty list can only answer
  // "no". Refuse instead: nothing has been written, claimed_at is
  // untouched, and the run stays claimable for the retry.
  if (copies.length !== squad.length) {
    return { ok: false, error: "Couldn't read the squad — try the claim again." };
  }

  // THE LAUNCH DAY'S BRIEF, in Eastern time — the calendar the whole card
  // economy keeps (open_daily_pack, launch_expedition's daily limit). The
  // player picked this squad against the brief that was posted when they
  // sent it out; scoring a 48-hour Legend Hunt against whatever the board
  // says two days later would make the bonus a lottery on the return time
  // instead of a reason to swap a card.
  const dateIso = easternDateOf(new Date(run.startedAt));
  const base = rollOutcome(tier, run.shine, copies, dateIso, expeditionRand);

  // Which copy wears the mark. Uniform over the squad and drawn AFTER the
  // outcome, so the mark's odds and its bearer stay independent — no card
  // is luckier than the two beside it. `min` is for the theoretical rand()
  // === 1 that a [0,1) generator never produces.
  const bearerId = base.mark
    ? squad[Math.min(squad.length - 1, Math.floor(expeditionRand() * squad.length))] ?? null
    : null;

  // In a convoy the sheet is both squads': a fork pushed only if both
  // pushed (convoySheet). Each run still rolls its own loot and its own
  // harm off that sheet.
  const partner = run.convoy !== null ? await convoyPartner(service, discordId, run.convoy) : null;
  const sheet = partner ? convoySheet(run.forks, run.choices, partner.choices) : choiceSheet(run.forks, run.choices);

  // The route: what the forks made of it and what the squad looks like.
  // The trail's beats, decided when the journal was written. The merchant
  // is a flat on top of the multiplied dollars; the stranded card is
  // another collector's open hold, the oldest one, released by the RPC
  // with a bounty — and only if one exists when the squad gets home, or
  // the journal's line stays a story. The road's beats (a cache, a rival,
  // a shrine, a hunter) are the route's to apply. Nothing here applies to
  // a squad that launched before the trail existed (hasTrail): it pays
  // and comes home exactly as it set out.
  const trail = hasTrail(run);
  // Match day: the fixtures of the LAUNCH day, on the same Eastern
  // calendar as the brief — a squad keeps the surge it left with. Read
  // from a day before the launch so a fixture at midnight UTC (8pm
  // Eastern the evening before) is in the window. The same read names
  // the playoff weeks the weather's Watch falls on.
  const fixtures = trail ? await fetchFixturesSince(service, new Date(Date.parse(run.startedAt) - DAY_MS).toISOString()) : [];
  // The weather the run launched under (weather.ts): derived from its
  // launch week, so the page, the ping and this claim agree.
  const weather = weatherOfRun(run, watchWeeksOf(fixtures));
  // Who else was on the road (company.ts): the real rivals the squad
  // raced and the ghosts it met, read the same way the page read them.
  const company = await fetchCompany(service, season, {
    id: run.id,
    discordId,
    tier,
    shine: run.shine,
    startedAt: run.startedAt,
    resolvesAt: run.resolvesAt,
    forks: run.forks,
    rules: run.rules,
    convoy: run.convoy,
    squadTeams: copies.map((copy) => copy.card?.teamName ?? null).filter((team): team is string => Boolean(team)),
  });
  // The squad's edges (archetypes.ts), under the rulebook the run was
  // stamped with: the traits bend the road the journal showed (the page
  // read them off the same squad), and the sheet is the launch squad's.
  const traits = traitsOf(copies, run.rules);
  const edges = run.rules >= ARCHETYPE_RULES ? activeAbilities(copies) : [];
  const encounters = encountersFor({ id: run.id, tier, startedAt: run.startedAt, resolvesAt: run.resolvesAt, forks: run.forks, rules: run.rules, convoy: run.convoy }, company, weather?.key ?? null, traits);
  // The base camp as it stands when the squad comes home covers the run
  // (camp.ts): a tent bought while the squad was out still pitches. Read
  // only under the rulebook that has a tent — the resolver ignores it
  // below ARCHETYPE_RULES, so an older run costs no round trip. A camp
  // that cannot be read (the base camp migration not applied, or the read
  // broke) is no tent, which is what every collector had before the camp.
  const camp = { tent: run.rules >= ARCHETYPE_RULES ? ((await fetchCamp(service, discordId))?.tent ?? 0) : 0 };
  // The route: what the forks made of it and what the squad looks like.
  // The road is the run's own (or the convoy's), so the places it walked
  // are the places the page showed.
  const route = resolveRoute(
    {
      tier,
      forks: run.forks,
      road: roadOf(run),
      copies,
      choices: sheet,
      insured: run.insured,
      grade: base.grade,
      target: run.target,
      encounters,
      weather: weather?.key ?? null,
      camp,
      shine: run.shine,
      now: new Date(),
    },
    expeditionRand,
  );
  // The merchant's flat — at Harvest prices under a Harvest, or in any
  // weather with a Gold Hoarder. Never both: Harvest prices are the most a
  // merchant pays, and the payout ceiling already carries them.
  const hoarded = edges.some((entry) => entry.ability.title === EDGE_TITLE.goldHoarder);
  const merchant = encounters.some((entry) => entry.key === "merchant") ? MERCHANT_DOLLARS * (weather?.key === "harvest" || hoarded ? HARVEST_MERCHANT : 1) : 0;
  let stranded: { holdId: number; bounty: number } | null = null;
  if (encounters.some((entry) => entry.key === "stranded")) {
    const [hold] = await fetchStrangersHolds(service, discordId);
    if (hold) stranded = { holdId: hold.holdId, bounty: STRANDED_BOUNTY };
  }
  const surge = surgeTeams(copies, teamsPlayingOn(fixtures, dateIso));
  const dollars = Math.round(base.dollars * route.lootMultiplier * (surge.length > 0 ? 1 + SURGE_BONUS : 1)) + merchant;
  // A pack found at a fork is a pack: the road's comp joins the finale's.
  const outcome: ExpeditionOutcome = { ...base, dollars, comp: base.comp || route.comp };
  // The echo: each moment on the squad rolls once, after everything else
  // so the scripted draws above are undisturbed on a squad without one.
  // The copy comes from the archived edition of the moment's week; a week
  // that was never archived has nothing to echo, and the roll is lost.
  let echo: { slug: string; week: string; moment: number; playerName: string } | null = null;
  for (const copy of trail ? copies : []) {
    const moment = copy.card?.moment;
    if (!moment || echo) continue;
    if (expeditionRand() >= ECHO_CHANCE) continue;
    const pool = echoPool(moment, await fetchEditionCards(service, copy.season, moment.weekStart));
    if (pool.length === 0) continue;
    const pick = pool[Math.min(pool.length - 1, Math.floor(expeditionRand() * pool.length))];
    echo = { slug: pick.slug, week: moment.weekStart, moment: copy.id, playerName: pick.name };
  }
  // A dead card cannot wear the mark.
  const dead = new Set(route.fates.filter((fate) => fate.fate === "dead").map((fate) => fate.id));
  const bearer = bearerId !== null && dead.has(bearerId) ? null : bearerId;
  // What the squad walked, for the atlas: the road the resolver just
  // walked, and the encounters and ghosts this claim read.
  const atlas = atlasStamp(run, forksFor(tier, roadOf(run)), encounters, company);

  const { data: claimData, error: claimError } = await service.rpc("resolve_expedition", {
    p_user: discordId,
    p_run: runId,
    p_outcome: {
      grade: outcome.grade,
      // Never null: rollOutcome always returns numbers, and the RPC's guards
      // are permissive about nulls rather than protective.
      dollars,
      baseDollars: base.dollars,
      comp: outcome.comp,
      mark: bearer === null ? null : outcome.mark,
      bearer,
      briefHit: outcome.briefHit,
      lootMultiplier: route.lootMultiplier,
      pushes: route.pushes,
      fragments: route.fragments,
      fates: route.fates.map((fate) => ({
        id: fate.id,
        fate: fate.fate,
        mutation: fate.mutation,
        ...(fate.woundedUntil ? { until: fate.woundedUntil } : {}),
      })),
      events: route.events,
      rescued: route.rescued,
      cleansed: route.cleansed,
      merchant,
      surge,
      // The rivals raced, for the season's rivalries — who, and who took
      // the spot. Stored whole with the outcome.
      rivals: (company?.rivals ?? []).map((rival) => ({ who: rival.who, name: rival.name, runId: rival.runId, won: rival.won })),
      ...(stranded ? { stranded: stranded.holdId, bounty: stranded.bounty } : {}),
      ...(echo ? { echo: { slug: echo.slug, week: echo.week, moment: echo.moment } } : {}),
      // The edges that counted, stored with the outcome so the log can say
      // what the squad walked with. Only under the rulebook that has them.
      ...(run.rules >= ARCHETYPE_RULES ? { abilities: edges.map((entry) => ({ copyId: entry.copyId, title: entry.ability.title, kind: entry.ability.kind })) } : {}),
      // Every claim, whatever its rulebook: the atlas's record of where the
      // squad went, and the only places a landmark or a road can count.
      atlas,
    },
  });
  if (claimError) {
    // The raw message, always: the friendly text is deliberately vague and
    // an unrecognised failure is exactly the case somebody will have to
    // diagnose from a screenshot.
    console.error("expeditions: claim rejected", { discordId, runId, message: claimError.message });
    return { ok: false, error: friendlyExpeditionError(claimError.message) };
  }
  const row = (Array.isArray(claimData) ? claimData[0] : claimData) as { balance: number; fragments: number; echo_id?: number | null } | null;

  // Did the rescue find anything? resolve_expedition stamps rescueMissed
  // when the hold closed underneath it, which it can only discover at
  // write time — the route rolled a success minutes or hours earlier.
  // Read back rather than widening the RPC's return type, which would
  // mean dropping a function the site calls on every claim.
  let rescueMissed = false;
  if (tier === "rescue" && route.rescued === true) {
    const { data: claimed } = await service
      .from("expedition_runs")
      .select("outcome")
      .eq("id", runId)
      .maybeSingle();
    rescueMissed = ((claimed as { outcome: { rescueMissed?: boolean } | null } | null)?.outcome?.rescueMissed) === true;
  }

  // The news, best effort and AFTER the write: the dollars and the stamps
  // are already committed, and a Discord outage must never fail a claim
  // that paid.
  await announceClaim(discordId, tier, outcome, route, copies);

  // The campaign, advanced: the stage's log, the road it sets for the
  // next stage, and on the finale the relic off the survivor with the
  // most miles. The RPC checks the stage and the claim under lock.
  let campaign: { key: CampaignState["key"]; stage: number; finished: boolean; relicName: string | null } | null = null;
  if (run.campaign !== null) {
    const open = await fetchCampaign(service, discordId, run.campaign);
    if (open && open.finishedAt === null && open.runs[open.runs.length - 1] === run.id) {
      const log: StageLog = {
        tier,
        grade: outcome.grade,
        pushes: route.pushes,
        survivors: route.fates.filter((fate) => fate.fate === "home" || fate.fate === "wounded").length,
        places: run.road ?? [],
        claimedAt: new Date().toISOString(),
      };
      const road = nextRoad(open.key, log);
      const finishing = road === null;
      const relicFrom = finishing ? relicBearer(route.fates, copies) : null;
      const { data: advanced, error: advanceError } = await service.rpc("advance_expedition_campaign", {
        p_user: discordId,
        p_campaign: open.id,
        p_road: road,
        p_log: log,
        p_relic_from: relicFrom,
      });
      if (advanceError) {
        console.error("expeditions: campaign advance refused", { discordId, runId, message: advanceError.message });
      } else {
        const rowAfter = (Array.isArray(advanced) ? advanced[0] : advanced) as { stage?: number; finished_at?: string | null; relic?: number | null } | null;
        const finished = Boolean(rowAfter?.finished_at);
        const relicName = finished && rowAfter?.relic && relicFrom ? (copies.find((copy) => copy.id === relicFrom)?.playerName ?? null) : null;
        campaign = { key: open.key, stage: Number(rowAfter?.stage ?? open.stage + 1), finished, relicName };
        if (finished) {
          try {
            await postCardsWebhook({
              title: `${CAMPAIGNS[open.key].label} — finished`,
              description: `<@${discordId}> walked all three stages of ${CAMPAIGNS[open.key].label}.${relicName ? ` The finale printed a relic of ${relicName} in the campaign's frame.` : " Nobody came home from the finale to carry the relic."}`,
              color: GOLD,
            });
          } catch (announceError) {
            console.error("expeditions: campaign announcement failed", announceError);
          }
        }
      }
    }
  }
  if (stranded) {
    // The channel hears a stranger's card is home — from a run that was
    // not theirs; the owner finds it on their shelf.
    try {
      await postCardsWebhook({
        title: "A lost card was carried home",
        description: `<@${discordId}>'s squad found a stranded card on the ${EXPEDITION_TIERS[tier].label} and brought it home for a ${stranded.bounty} bounty. Its owner will find it on their shelf, wounded but back.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: stranded announcement failed", announceError);
    }
  }

  if (echo && row?.echo_id) {
    try {
      await postCardsWebhook({
        title: "A moment echoed",
        description: `<@${discordId}>'s squad carried a moment out on the ${EXPEDITION_TIERS[tier].label}, and it echoed: a copy of ${echo.playerName} from that game came home with them.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: echo announcement failed", announceError);
    }
  }

  // The atlas, last and best effort: the claim above has paid.
  const walked = await recordAtlas(service, { discordId, season, runId, tier, stamp: atlas });

  return {
    ok: true,
    outcome,
    route,
    bearerId: bearer,
    surge,
    echo: echo && row?.echo_id ? { inventoryId: Number(row.echo_id), slug: echo.slug, playerName: echo.playerName, moment: echo.moment } : null,
    balance: Number(row?.balance ?? 0),
    fragments: Number(row?.fragments ?? 0) + (walked?.road?.fragments ?? 0),
    baseDollars: base.dollars,
    merchant,
    stranded,
    rescueMissed,
    campaign,
    ...(walked ? { atlas: walked } : {}),
  };
}

/**
 * The atlas's half of a claim, after resolve_expedition has committed:
 * name the places this squad was first to this season, then — when the
 * season's stamps now cover the route's whole road — pay the road. Both
 * RPCs decide for themselves (first claim wins; a road is paid once), so
 * this only asks. Every failure is logged and swallowed: a claim that paid
 * never fails here, and an environment without the atlas migration simply
 * names nothing and pays nothing.
 */
async function recordAtlas(
  service: BettingServiceClient,
  input: { discordId: string; season: string; runId: number; tier: ExpeditionTierKey; stamp: AtlasStamp },
): Promise<ClaimAtlas | null> {
  const { discordId, season, runId, tier, stamp } = input;
  if (!season || stamp.places.length === 0) return null;

  let firsts: string[] = [];
  try {
    const { data, error } = await service.rpc("name_expedition_landmarks", { p_user: discordId, p_run: runId, p_places: stamp.places });
    if (error) {
      console.error("expeditions: landmarks not named", { discordId, runId, message: error.message });
    } else {
      // Only rows for this run's own places count as news, whatever else
      // comes back.
      const named = (Array.isArray(data) ? data : []) as { place?: unknown }[];
      firsts = stamp.places.filter((place) => named.some((entry) => entry?.place === place));
    }
  } catch (atlasError) {
    console.error("expeditions: landmarks not named", atlasError);
  }
  const titles = firsts.map((place) => placeTitle(place)).filter((title): title is string => title !== null);
  if (titles.length > 0) {
    try {
      await postCardsWebhook({
        title: titles.length === 1 ? "A landmark named" : "Landmarks named",
        description: `${firstNamedLine(`<@${discordId}>`, titles, tier)} ${titles.length === 1 ? "It carries" : "They carry"} their name this season.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: landmark announcement failed", announceError);
    }
  }

  let road: ClaimAtlas["road"] = null;
  const history = await fetchAtlasRuns(service, discordId, season, tier);
  if (history && roadComplete(atlasFor(history), tier)) {
    try {
      const { data, error } = await service.rpc("award_expedition_road", { p_user: discordId, p_season: season, p_tier: tier });
      if (error) {
        console.error("expeditions: road not awarded", { discordId, runId, tier, message: error.message });
      } else {
        const paid = (Array.isArray(data) ? data[0] : data) as { awarded?: boolean; fragments?: number } | null;
        if (paid?.awarded === true) road = { tier, fragments: Number(paid.fragments ?? 0), comp: ROAD_REWARDS[tier].comp };
      }
    } catch (atlasError) {
      console.error("expeditions: road not awarded", atlasError);
    }
  }
  if (road) {
    try {
      await postCardsWebhook({
        title: `${EXPEDITION_TIERS[tier].label} — every place walked`,
        description: `<@${discordId}> has walked every place on ${routeName(tier)} this season: ${rewardWords(road)}.`,
        color: GOLD,
      });
    } catch (announceError) {
      console.error("expeditions: road announcement failed", announceError);
    }
  }

  return titles.length > 0 || road ? { firsts: titles, road } : null;
}

async function announceClaim(
  discordId: string,
  tier: ExpeditionTierKey,
  outcome: ExpeditionOutcome,
  route: RouteResult,
  copies: CardCopy[],
): Promise<void> {
  const nameOf = (id: number) => copies.find((copy) => copy.id === id)?.playerName ?? `#${id}`;
  const embeds: { title: string; description: string; color: number }[] = [];
  if (tier === "legend" && outcome.grade === "jackpot") {
    embeds.push({
      title: "Legend Hunt — jackpot",
      description: `<@${discordId}>'s Legend Hunt struck gold: ${outcome.dollars} dollars${outcome.comp ? ", a free pack" : ""}${outcome.mark ? ", and a card came back wearing the Legend Finish" : ""}.`,
      color: GOLD,
    });
  }
  const voidtouched = route.fates.filter((fate) => fate.mutation === "voidtouched");
  if (voidtouched.length > 0) {
    embeds.push({
      title: "Back from the Legendary route — Voidtouched",
      description: `<@${discordId}>'s ${voidtouched.map((fate) => nameOf(fate.id)).join(" and ")} went somewhere the map does not show, and came home Voidtouched.`,
      color: GOLD,
    });
  }
  const voidborn = route.fates.filter((fate) => fate.mutation === "voidborn");
  if (voidborn.length > 0) {
    embeds.push({
      title: "Back from the Mythic route — Voidborn",
      description: `<@${discordId}>'s ${voidborn.map((fate) => nameOf(fate.id)).join(" and ")} went back through the rift, and the void kept ${voidborn.length === 1 ? "it" : "them"}. Voidborn — the second stage.`,
      color: GOLD,
    });
  }
  const dead = route.fates.filter((fate) => fate.fate === "dead");
  if (dead.length > 0) {
    embeds.push({
      title: "Lost on the Legendary route",
      description: `<@${discordId}>'s ${dead.map((fate) => nameOf(fate.id)).join(" and ")} did not come home. ${dead.length === 1 ? "It rests" : "They rest"} in the graveyard.`,
      color: LIVE_RED,
    });
  }
  for (const embed of embeds) {
    try {
      await postCardsWebhook(embed);
    } catch (announceError) {
      console.error("expeditions: announcement failed", announceError);
    }
  }
}

/** Buys a lost card back. The price is read off the card here and range-
 *  checked by the RPC; the hold is released and the card comes home
 *  wounded, exactly as a rescue would bring it. */
export async function ransomLostCardFor(discordId: string, holdId: number): Promise<RansomResult> {
  if (!Number.isInteger(holdId)) return { ok: false, error: friendlyExpeditionError("no such lost card") };
  const { run: hold, error } = await readRun(discordId, holdId);
  if (error) return { ok: false, error: "Couldn't read that card — try again." };
  if (!hold || hold.tier !== "lost" || hold.claimedAt || hold.squad.length !== 1) {
    return { ok: false, error: friendlyExpeditionError("no such lost card") };
  }
  const service = createBettingServiceClient();
  const [copy] = await fetchInventoryByIds(service, discordId, hold.squad);
  if (!copy) return { ok: false, error: friendlyExpeditionError("no such lost card") };
  const paid = ransomFor(copy);
  const { data, error: rpcError } = await service.rpc("ransom_lost_card", {
    p_user: discordId,
    p_hold: holdId,
    p_dollars: paid,
  });
  if (rpcError) return { ok: false, error: friendlyExpeditionError(rpcError.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { balance: number } | null;
  return { ok: true, balance: Number(row?.balance ?? 0), paid };
}
