"use server";

// The Gauntlet's state machine: enter, fight, choose, pick, reset, swap.
//
// Every transition is a compare-and-swap on the run row, so a double-click
// or a refresh can never fight the same round twice or spend one relic
// pick as two. Fights resolve as PURE functions of what the row already
// holds — the seed was rolled by CSPRNG and STORED before the fight — so a
// raced retry recomputes the identical result and only one write wins.
//
// Money moves only through the two SQL doors (gauntlet_enter /
// gauntlet_payout): ledger row and balance move as the same number in one
// transaction, entry charged first with the refund door as compensation —
// pack-open discipline, applied to a game.

import { randomBytes } from "node:crypto";
import { isSlabbed, slabRefusal } from "@/lib/cards/wear";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getBettingUser } from "@/lib/betting/wallet";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons } from "@/lib/cards/queries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import type { PlayerCardData } from "@/lib/cards/build";
import type { MeasureKey } from "@/lib/cards/measures";
import { mondayOf } from "@/lib/packs/week";
import { aggregateEffects, offerRelics, RELIC_BY_KEY } from "./relics";
import { buildAutopsy } from "./autopsy";
import { CROSSROADS_BY_KEY } from "./crossroads";
import { generateOpponent, ghostOpponent, weekSeed } from "./opponents";
import { drawGhostBracket, fetchGhostPool } from "./ghostQueries";
import { BOUNTY_MULT, sameLineup } from "./ghosts";
import { recordRelicOffer, recordRound, relicOfferRow, roundLogRow } from "./telemetry";
import { heirloomOf, type StoredHeirloom } from "./heirlooms";
import { GAUNTLET_ENTRY_FEE, type GauntletRunRow, matchContextFor } from "./run";
import { canBank, purseStep } from "./purse";
import { ascensionRules, clampAscension } from "./ascension";
import { fetchAscension, fetchContractProgress } from "./queries";
import { contractsSatisfied, type ContractDef } from "./contracts";
import { openerAllowed } from "./openers";
import { dealHand, lineupFromHand } from "./drafted";
import { buildGauntletOptions } from "./queries";
import { fetchInventory } from "@/lib/packs/queries";
import {
  GAUNTLET_ROLES,
  GAUNTLET_ROUNDS,
  type GauntletCard,
  type GauntletRole,
  makeTrialist,
  type MatchResult,
  mulberry32,
  roundScore,
  simulateFirstHalf,
  simulateSecondHalf,
} from "./sim";


type ActionResult<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string };

const seed32 = (): number => randomBytes(4).readUInt32BE(0);

async function loadOwnRun(
  service: ReturnType<typeof createBettingServiceClient>,
  runId: number,
  discordId: string,
): Promise<GauntletRunRow | null> {
  const { data } = await service.from("gauntlet_runs").select("*").eq("id", runId).maybeSingle();
  const run = data as GauntletRunRow | null;
  // Not-yours and doesn't-exist collapse, same as every inventory door.
  if (!run || run.discord_id !== discordId) return null;
  return run;
}

function revalidateGauntlet(): void {
  revalidatePath("/cards/gauntlet");
}

/**
 * Starts a run: one owned card per role (or a trialist), frozen into the
 * lineup with Fresh Legs marked, the entry fee charged, and round 1's
 * seed + opponent rolled and stored before anything resolves.
 */
export async function startGauntletRunAction(
  picks: Partial<Record<GauntletRole, number | null>>,
  /** One moment or roster plate from the shelf, brought along for the run.
   *  Never spent, never fielded — see lib/gauntlet/heirlooms.ts. */
  heirloomId?: number | null,
  /** The ascension to fight at — clamped to what this player has unlocked
   *  this season (src/lib/gauntlet/ascension.ts). */
  ascension = 0,
  /** The opener to bring — must be one this season's contracts unlocked
   *  (src/lib/gauntlet/openers.ts). Null brings nothing. */
  openerKey: string | null = null,
  /** A dealt hand (dealGauntletHandAction) the five must come from —
   *  drafted mode. Null drafts from the whole shelf. */
  dealId: number | null = null,
): Promise<ActionResult<{ run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  // The run is filed under the premier season — that is the board it ranks
  // on — but a card may come from EITHER shelf. A collection is a
  // collection; refusing an academy card was a rule about where the run is
  // scored leaking into a question about who you own.
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season;
  if (!season) return { ok: false, error: "No season is set up for cards yet." };
  const fieldable = new Set(seasons.map((entry) => entry.season));

  const wantedIds = GAUNTLET_ROLES.map((role) => picks[role]).filter(
    (id): id is number => typeof id === "number",
  );
  if (new Set(wantedIds).size !== wantedIds.length) {
    return { ok: false, error: "One card can't play two roles." };
  }

  let rows: {
    id: number;
    discord_id: string;
    season: string;
    role: string;
    overall: number;
    tier: string;
    foil: boolean;
    signed: boolean | null;
    edition_week: string;
    player_name: string;
    card: PlayerCardData;
  }[] = [];
  if (wantedIds.length > 0) {
    const { data, error } = await service
      .from("card_inventory")
      .select("id, discord_id, season, role, overall, tier, foil, signed, edition_week, player_name, card")
      .in("id", wantedIds);
    if (error) return { ok: false, error: "Couldn't read your collection — try again." };
    rows = (data as typeof rows) ?? [];
  }

  // A card away on an expedition — or lost on one — cannot also be here.
  // The lock is a fact about the card, so it is checked whatever shelf the
  // card came from.
  const deployed = wantedIds.length > 0 ? await fetchDeployedCopyIds(service, user.discordId) : new Set<number>();
  const thisWeek = mondayOf(new Date());
  const now = Date.now();
  const lineup: GauntletCard[] = [];
  for (const role of GAUNTLET_ROLES) {
    const pickedId = picks[role];
    if (typeof pickedId !== "number") {
      lineup.push(makeTrialist(role));
      continue;
    }
    const row = rows.find((r) => r.id === pickedId);
    if (!row || row.discord_id !== user.discordId) {
      return { ok: false, error: "One of those cards isn't in your collection." };
    }
    // Any of the league's current shelves, premier or academy — but not a
    // PAST season's, which is a different set of ratings entirely.
    if (!fieldable.has(row.season)) {
      return { ok: false, error: `${row.player_name} is from an old season's shelf.` };
    }
    if (row.card.moment || row.card.champWin || row.card.team) {
      return { ok: false, error: `${row.player_name} is a relic — relics watch from the shelf.` };
    }
    if (isSlabbed(row.card)) return { ok: false, error: slabRefusal(row.player_name) };
    if (row.role !== role) return { ok: false, error: `${row.player_name} doesn't play ${role}.` };
    if (deployed.has(row.id)) return { ok: false, error: `${row.player_name} is away on an expedition.` };
    // The bench: a wounded card sits out the Gauntlet until its stamp says.
    const woundedUntil = row.card.wounded?.until ? new Date(row.card.wounded.until).getTime() : 0;
    if (woundedUntil > now) {
      return {
        ok: false,
        error: `${row.player_name} is wounded — benched until ${new Date(woundedUntil).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "America/New_York" })} ET.`,
      };
    }
    const stats: Partial<Record<MeasureKey, number>> = Object.fromEntries(
      (row.card.subStats ?? []).map((bar) => [bar.key, bar.value]),
    );
    lineup.push({
      inventoryId: row.id,
      name: row.player_name,
      role,
      overall: row.overall,
      stats,
      foil: row.foil,
      signed: row.signed === true,
      fresh: row.edition_week === thisWeek,
      team: row.card.teamName ?? null,
      mutation: row.card.mutation?.key ?? null,
    });
  }

  const lineupAvg = lineup.reduce((sum, card) => sum + card.overall, 0) / lineup.length;

  // The shelf relic, if one was brought. Validated the same way the five
  // are: it has to be this caller's copy, off a current shelf, and it has
  // to actually BE a relic — a player card belongs in the lineup.
  let heirloom: StoredHeirloom | null = null;
  if (typeof heirloomId === "number") {
    const { data: relicRow } = await service
      .from("card_inventory")
      .select("id, discord_id, season, card")
      .eq("id", heirloomId)
      .maybeSingle();
    const row = relicRow as { id: number; discord_id: string; season: string; card: PlayerCardData } | null;
    if (!row || row.discord_id !== user.discordId) {
      return { ok: false, error: "That relic isn't in your collection." };
    }
    if (!fieldable.has(row.season)) {
      return { ok: false, error: "That relic is from an old season's shelf." };
    }
    heirloom = heirloomOf(row.id, row.card);
    if (!heirloom) {
      return { ok: false, error: "Only a moment or a roster plate can come along." };
    }
  }

  // The level: whatever was asked for, never above what a clear unlocked.
  // A stale page asking for a level you don't hold plays level 0's rules
  // rather than being refused — the request was a preference, not a claim.
  const unlocked = await fetchAscension(service, user.discordId, season);
  const level = clampAscension(ascension, unlocked);

  // The opener: earned by contracts, never by asking. An unearned key is
  // a refusal, not a silent downgrade — the draft screen only offers what
  // is unlocked, so a request past it is a stale page or a hand-rolled
  // call, and both deserve the message.
  const opener = typeof openerKey === "string" && openerKey.length > 0 ? openerKey : null;
  if (opener) {
    const progress = await fetchContractProgress(service, user.discordId, season, thisWeek);
    if (!openerAllowed(opener, progress.seasonTotal)) {
      return { ok: false, error: "That opener isn't unlocked yet — finish more contracts." };
    }
  }

  // Drafted mode: the five must come from the hand that was dealt, and
  // the hand must be this player's and unused. A drafted run is exempt
  // from the no-repeat rule — the hand is the variety.
  let drafted = false;
  if (typeof dealId === "number") {
    const { data: dealRow } = await service
      .from("gauntlet_deals")
      .select("id, discord_id, ids, run_id")
      .eq("id", dealId)
      .maybeSingle();
    const deal = dealRow as { id: number; discord_id: string; ids: number[]; run_id: number | null } | null;
    if (!deal || deal.discord_id !== user.discordId) return { ok: false, error: "That hand isn't yours." };
    if (deal.run_id !== null) return { ok: false, error: "That hand was already played — deal again." };
    if (!lineupFromHand(lineup.map((card) => card.inventoryId), deal.ids.map(Number))) {
      return { ok: false, error: "In drafted mode the five must come from the hand you were dealt." };
    }
    drafted = true;
  }

  // A re-run has to be a different run. Checked BEFORE the fee is taken,
  // so a refused entry never costs anything.
  const { data: lastRuns } = await service
    .from("gauntlet_runs")
    .select("lineup")
    .eq("discord_id", user.discordId)
    .order("created_at", { ascending: false })
    .limit(1);
  const previous = (lastRuns as { lineup: GauntletCard[] }[] | null)?.[0]?.lineup;
  if (!drafted && previous && sameLineup(previous, lineup)) {
    return {
      ok: false,
      error: "Change at least one card — a re-run should be a different run, not the same five again.",
    };
  }

  // Charge first, refund as compensation — the pack pattern.
  const { error: feeError } = await service.rpc("gauntlet_enter", {
    p_user: user.discordId,
    p_fee: GAUNTLET_ENTRY_FEE,
  });
  if (feeError) {
    return {
      ok: false,
      error: /insufficient/i.test(feeError.message)
        ? `A run costs ${GAUNTLET_ENTRY_FEE} betting dollars — your wallet is short.`
        : "Couldn't start the run — is the gauntlet migration applied?",
    };
  }

  const seed = seed32();
  // The seed this run's own bracket is drawn with. Rolled once, here, and
  // never again — a run's eight opponents are fixed the moment it starts.
  const ghostSeed = seed32();
  const opponent = await stageOpponent(service, lineupAvg, 1, thisWeek, ghostSeed, level);
  const { data: inserted, error: insertError } = await service
    .from("gauntlet_runs")
    .insert({
      discord_id: user.discordId,
      season,
      week_start: thisWeek,
      lineup,
      lineup_avg: lineupAvg,
      round_seed: seed,
      ghost_seed: ghostSeed,
      heirloom,
      next_opponent: opponent,
      ascension: level,
      opener,
      drafted,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    const { error: refundError } = await service.rpc("gauntlet_payout", {
      p_user: user.discordId,
      p_amount: GAUNTLET_ENTRY_FEE,
      p_reason: "gauntlet_refund",
    });
    if (refundError) console.error("gauntlet: entry refund failed", { discordId: user.discordId, refundError });
    const active = /gauntlet_one_active/.test(insertError?.message ?? "");
    return {
      ok: false,
      error: active
        ? "You already have a live run — finish it or walk away first."
        : `The run didn't start${refundError ? " and the fee couldn't be returned — staff have been notified" : " — your fee was returned"}.`,
    };
  }

  // A run is a fielding: every real card in it wears one. Best effort,
  // same as the hand below — the run exists either way.
  const fielded = lineup.map((card) => card.inventoryId).filter((id): id is number => typeof id === "number" && id > 0);
  if (fielded.length > 0) {
    const { error: wearError } = await service.rpc("wear_cards", { p_ids: fielded });
    if (wearError) console.error("gauntlet: wear_cards failed", { discordId: user.discordId, wearError });
  }

  // The hand is spent. Best effort: a run that started is a run that
  // started, and a hand marked late is a support question, not a lost fee.
  if (typeof dealId === "number") {
    await service.from("gauntlet_deals").update({ run_id: (inserted as GauntletRunRow).id }).eq("id", dealId).is("run_id", null);
  }

  revalidateGauntlet();
  return { ok: true, run: inserted as GauntletRunRow };
}

/**
 * Deals a hand for drafted mode: a few random eligible cards per role
 * from the caller's own shelves, drawn by CSPRNG and recorded so the
 * entry can check the five against it. Free — the fee is paid at entry.
 */
export async function dealGauntletHandAction(): Promise<ActionResult<{ dealId: number; ids: number[] }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };
  const service = createBettingServiceClient();
  const seasons = await fetchAllCardSeasons(service);
  const season = seasons.find((entry) => entry.league === "premier")?.season;
  if (!season) return { ok: false, error: "No season is set up for cards yet." };
  const week = mondayOf(new Date());
  const shelves = await Promise.all(seasons.map((entry) => fetchInventory(service, user.discordId, entry.season)));
  const options = buildGauntletOptions(shelves.flat(), week);
  const ids = dealHand(options, mulberry32(seed32()));
  if (ids.length === 0) return { ok: false, error: "Nothing on the shelf to deal from." };
  const { data, error } = await service
    .from("gauntlet_deals")
    .insert({ discord_id: user.discordId, season, week_start: week, ids })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Couldn't deal a hand — is the gauntlet drafted migration applied?" };
  return { ok: true, dealId: Number((data as { id: number }).id), ids };
}

/**
 * Resolves the FIRST HALF of the pending fight and pauses the game at the
 * crossroads. Pure given the row (stored seed, stored opponent), so a
 * retry recomputes the same half; the second half's seed is rolled and
 * STORED here, before anything it decides resolves. The CAS update means
 * exactly one write lands.
 */
export async function fightGauntletRoundAction(
  runId: number,
): Promise<ActionResult<{ run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active") return { ok: false, error: "That run is over." };
  if (run.relic_offer) return { ok: false, error: "Pick your relic first." };
  if (run.crossroads) return { ok: false, error: "The game is paused at the crossroads — make the call." };
  if (run.round_seed === null || !run.next_opponent) return { ok: false, error: "No fight is staged — reload." };

  const ctx = matchContextFor(run.relics, run.next_opponent, weekSeed(run.week_start, run.round), run.heirloom, run.lineup, run.ascension ?? 0, run.opener ?? null);
  const state = simulateFirstHalf(run.lineup, run.next_opponent.cards, ctx, mulberry32(run.round_seed));
  const seed2 = seed32();

  const { data: updated, error: updateError } = await service
    .from("gauntlet_runs")
    .update({
      crossroads: { state, seed2 },
      round_seed: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("round", run.round)
    .is("relic_offer", null)
    .is("crossroads", null)
    .select("*");

  if (updateError) {
    return { ok: false, error: "Couldn't pause the game — is the gauntlet crossroads migration applied?" };
  }
  if (!updated || updated.length === 0) {
    // Raced by our own double-click: the row already moved (the winner's
    // seed2 stands — the first half itself is identical by construction).
    const current = await loadOwnRun(service, runId, user.discordId);
    if (!current) return { ok: false, error: "That run isn't yours." };
    revalidateGauntlet();
    return { ok: true, run: current };
  }

  revalidateGauntlet();
  return { ok: true, run: (updated as GauntletRunRow[])[0] };
}

/**
 * The call at the crossroads: resolves the second half with the seed the
 * first half stored. The choice must be on the situation's table; the
 * whole win/offer/cleared/fallen transition of v1's fight lives here now.
 */
export async function chooseGauntletPathAction(
  runId: number,
  choiceKey: string,
): Promise<ActionResult<{ result: MatchResult; run: GauntletRunRow; contracts: { key: string; title: string; reward: number }[] }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active") return { ok: false, error: "That run is over." };
  if (!run.crossroads || !run.next_opponent) return { ok: false, error: "No call is pending — reload." };

  const situation = CROSSROADS_BY_KEY.get(run.crossroads.state.situationKey);
  if (!situation || !situation.choices.some((choice) => choice.key === choiceKey)) {
    return { ok: false, error: "That call isn't on the table." };
  }

  const ctx = matchContextFor(run.relics, run.next_opponent, weekSeed(run.week_start, run.round), run.heirloom, run.lineup, run.ascension ?? 0, run.opener ?? null);
  const sim = simulateSecondHalf(
    run.crossroads.state,
    choiceKey,
    run.lineup,
    run.next_opponent.cards,
    ctx,
    mulberry32(run.crossroads.seed2),
  );
  // Beating one of last week's top finishers pays extra. Applied here
  // rather than inside the engine: who you are fighting is a fact about
  // the bracket, not about the match, and the sim stays a pure function
  // of the board.
  const bounty = sim.won && run.next_opponent.ghost?.bounty === true;
  const score = Math.round(roundScore(run.round, sim, run.lineup, ctx.effects) * (bounty ? BOUNTY_MULT : 1));
  const result: MatchResult = { ...sim, score };
  // The read of the match, computed from the tape it just produced —
  // stored with it so a refresh redraws the same explanation.
  const autopsy = buildAutopsy(sim, run.crossroads.state.lanesWon);

  const cleared = sim.won && run.round >= GAUNTLET_ROUNDS;
  // The offer derives from the SAME stored seed (offset stream), so a
  // raced retry offers the same three relics.
  // A level-3 run's offer is two of the same three, so a raced retry
  // still sees the same cards.
  const offer =
    sim.won && !cleared
      ? offerRelics(run.relics, mulberry32(run.crossroads.seed2 + 1), run.round)
          .map((r) => r.key)
          .slice(0, ascensionRules(run.ascension ?? 0).offerSize)
      : null;

  // The purse: a won round adds its step (THE SAFE HOUSE multiplies it); a
  // lost one leaves the number on the row for the record and pays nothing
  // (purse_paid stays zero).
  const purse =
    (run.purse ?? 0) + (sim.won ? Math.round(purseStep(run.round, run.ascension ?? 0) * (ctx.effects.purseMult ?? 1)) : 0);

  // THE SECOND WIND: the first loss does not end the run. The round is
  // lost — no score, no purse, no offer — but the run stays active on the
  // same round, and the next fight is staged fresh.
  const secondWind = !sim.won && ctx.effects.secondWind === true && run.second_wind_used !== true;
  const restage = secondWind
    ? { round_seed: seed32(), next_opponent: await stageOpponent(service, run.lineup_avg, run.round, run.week_start, run.ghost_seed, run.ascension ?? 0) }
    : {};

  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({
      score: run.score + score,
      purse,
      status: cleared ? "cleared" : sim.won || secondWind ? "active" : "fallen",
      round: sim.won && !cleared ? run.round + 1 : run.round,
      relic_offer: offer,
      crossroads: null,
      next_opponent: sim.won ? null : secondWind ? restage.next_opponent : run.next_opponent,
      ...(secondWind ? { round_seed: restage.round_seed, second_wind_used: true } : {}),
      last_result: { ...result, round: run.round, autopsy },
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("round", run.round)
    .is("relic_offer", null)
    .not("crossroads", "is", null)
    .select("*");

  // The balance tape, after the response. Best-effort by construction:
  // a telemetry hiccup must never turn a resolved round into an error.
  if (updated && updated.length > 0) {
    const logRow = roundLogRow(run, choiceKey, result);
    after(() => recordRound(service, logRow));
  }

  if (!updated || updated.length === 0) {
    // Raced by our own double-click: the row already moved. Hand back what
    // it moved TO — the recomputed result is identical by construction
    // when the same choice raced; a different choice lost the CAS.
    const current = await loadOwnRun(service, runId, user.discordId);
    if (!current) return { ok: false, error: "That run isn't yours." };
    revalidateGauntlet();
    return { ok: true, result, run: current, contracts: [] };
  }

  // Contracts: a won round is checked against the week's three, and each
  // one it satisfies for the first time this week is paid through a door
  // whose primary key is the "once". Best effort after the write, and
  // only ever additive — a contract that fails to record is a support
  // question, never a lost round.
  const contracts: { key: string; title: string; reward: number }[] = [];
  if (sim.won) {
    try {
      const progress = await fetchContractProgress(service, user.discordId, run.season, run.week_start);
      const satisfied: ContractDef[] = contractsSatisfied(run.week_start, progress.thisWeek, {
        run: { round: run.round, lineup: run.lineup, relics: run.relics, ascension: run.ascension ?? 0 },
        state: run.crossroads.state,
        result: sim,
        opponent: run.next_opponent,
      });
      for (const contract of satisfied) {
        const { data: paid, error: contractError } = await service.rpc("gauntlet_complete_contract", {
          p_user: user.discordId,
          p_season: run.season,
          p_week: run.week_start,
          p_key: contract.key,
          p_run: run.id,
          p_reward: contract.reward,
        });
        if (contractError) console.error("gauntlet: contract pay failed", { runId: run.id, key: contract.key, contractError });
        else if (Number(paid ?? 0) > 0) contracts.push({ key: contract.key, title: contract.title, reward: Number(paid) });
      }
    } catch (error) {
      console.error("gauntlet: contracts check failed", error);
    }
  }

  // A full clear collects the purse on the spot. The door is idempotent
  // (purse_paid), so if this call fails the end screen offers "Collect"
  // and the same RPC pays it then.
  let finalRow = (updated as GauntletRunRow[])[0];
  if (cleared) {
    const { error: purseError } = await service.rpc("gauntlet_cash_out", { p_user: user.discordId, p_run: run.id });
    if (purseError) console.error("gauntlet: purse collect on clear failed", { runId: run.id, purseError });
    else finalRow = (await loadOwnRun(service, run.id, user.discordId)) ?? finalRow;
    // The ladder: a clear at this level unlocks the next for the season.
    const { error: ascendError } = await service.rpc("gauntlet_ascend", {
      p_user: user.discordId,
      p_season: run.season,
      p_level: run.ascension ?? 0,
    });
    if (ascendError) console.error("gauntlet: ascend on clear failed", { runId: run.id, ascendError });
  }

  // A full clear is the mode's rarest event — the channel hears about it.
  // Best-effort: a webhook hiccup must never turn a won run into an error.
  if (cleared) {
    try {
      const { data: profile } = await service
        .from("betting_profiles")
        .select("username")
        .eq("discord_id", user.discordId)
        .maybeSingle();
      const who = (profile as { username: string | null } | null)?.username ?? "Someone";
      await postCardsWebhook({
        title: "⚔🏆 THE GAUNTLET FALLS",
        description: `**${who}** cleared all eight rounds${(run.ascension ?? 0) > 0 ? ` at **ascension ${run.ascension}**` : ""} — final score **${(run.score + score).toLocaleString()}**, purse **$${purse}** collected.\n${(run.ascension ?? 0) >= 5 ? "There is no higher." : `Ascension ${(run.ascension ?? 0) + 1} is open to them.`}`,
        color: GOLD,
      });
    } catch (error) {
      console.error("gauntlet: full-clear announce failed", error);
    }
  }

  revalidateGauntlet();
  return { ok: true, result, run: finalRow, contracts };
}

/**
 * Banks the purse: the run ends between fights and the dollars are paid,
 * or a cleared run whose collect-on-clear failed collects now. The RPC
 * does the transition and the payment under the row lock, so a double
 * click can't pay twice and a run mid-fight can't bank at all.
 */
export async function bankGauntletRunAction(runId: number): Promise<ActionResult<{ paid: number; balance: number; run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status === "active" && !canBank(run)) {
    return { ok: false, error: "The purse is on the table until the whistle — finish the fight or walk away without it." };
  }
  if (run.status !== "active" && run.status !== "cleared") return { ok: false, error: "That run is over." };
  if ((run.purse_paid ?? 0) > 0) return { ok: false, error: "That purse was already paid." };

  const { data, error } = await service.rpc("gauntlet_cash_out", { p_user: user.discordId, p_run: run.id });
  if (error) {
    return {
      ok: false,
      error: /fight in progress/i.test(error.message)
        ? "The purse is on the table until the whistle — finish the fight or walk away without it."
        : /already paid/i.test(error.message)
          ? "That purse was already paid."
          : "Couldn't bank the purse — is the gauntlet purse migration applied?",
    };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { paid: number; balance: number } | null;
  const current = (await loadOwnRun(service, run.id, user.discordId)) ?? run;
  revalidateGauntlet();
  return { ok: true, paid: Number(row?.paid ?? 0), balance: Number(row?.balance ?? 0), run: current };
}


/**
 * The round's opponent: one of last week's runs if somebody reached this
 * round, an invented team if nobody did.
 *
 * The POOL is shared — last week's runs, the same population for the
 * whole league. The DRAW is private, seeded by the run's own ghost_seed,
 * because the leaderboard takes a player's best run and a memorisable
 * week would pay attempts instead of skill. Everyone fights the same
 * people; nobody fights them in the same order.
 *
 * The round's RULES stay week-seeded either way — the wall, the patch and
 * the traits are properties of the round, so round four is round four for
 * everybody. A lookup failure of any kind falls through to the generator
 * rather than blocking a fight.
 */
async function stageOpponent(
  service: ReturnType<typeof createBettingServiceClient>,
  lineupAvg: number,
  round: number,
  weekStart: string,
  ghostSeed: number | null,
  ascension = 0,
) {
  const roundSeed = weekSeed(weekStart, round);
  try {
    const pool = await fetchGhostPool(service, weekStart);
    const ghost = drawGhostBracket(pool, ghostSeed, weekStart).get(round);
    if (ghost) return ghostOpponent(ghost, lineupAvg, round, mulberry32(roundSeed), ascension);
  } catch (error) {
    console.error("gauntlet: ghost pool lookup failed", error);
  }
  return generateOpponent(lineupAvg, round, mulberry32(roundSeed), ascension);
}

/** Takes one relic from the pending offer and stages the next fight —
 *  new CSPRNG seed, new opponent, both stored before anything resolves. */
export async function pickGauntletRelicAction(
  runId: number,
  relicKey: string,
): Promise<ActionResult<{ run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  if (!RELIC_BY_KEY.has(relicKey)) return { ok: false, error: "That relic isn't in the catalog." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active" || !run.relic_offer) return { ok: false, error: "No relic is on offer." };
  if (!run.relic_offer.includes(relicKey)) return { ok: false, error: "That relic wasn't offered." };

  const seed = seed32();
  const opponent = await stageOpponent(service, run.lineup_avg, run.round, run.week_start, run.ghost_seed, run.ascension ?? 0);
  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({
      relics: [...run.relics, relicKey],
      relic_offer: null,
      round_seed: seed,
      next_opponent: opponent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("round", run.round)
    .not("relic_offer", "is", null)
    .select("*");
  if (!updated || updated.length === 0) return { ok: false, error: "That pick already happened — reload." };

  // Three keys went out and one came back — the denominator a relic's
  // pick rate needs. Recorded off the response path, same as the call.
  const offerRow = relicOfferRow(run, relicKey);
  after(() => recordRelicOffer(service, offerRow));

  revalidateGauntlet();
  return { ok: true, run: (updated as GauntletRunRow[])[0] };
}

/**
 * THE REMATCH: re-rolls the pending offer once per run. A fresh CSPRNG
 * seed, the same draw the round would have made, the same size the
 * ascension allows — stored under a CAS so a double-click re-rolls once.
 */
export async function rerollGauntletOfferAction(runId: number): Promise<ActionResult<{ run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active" || !run.relic_offer) return { ok: false, error: "No relic is on offer." };
  if (!aggregateEffects(run.relics).rerollOffer) return { ok: false, error: "THE REMATCH isn't in your build." };
  if (run.reroll_used) return { ok: false, error: "The rematch was already dealt." };

  const offer = offerRelics(run.relics, mulberry32(seed32()), run.round)
    .map((relic) => relic.key)
    .slice(0, ascensionRules(run.ascension ?? 0).offerSize);
  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({ relic_offer: offer, reroll_used: true, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("reroll_used", false)
    .not("relic_offer", "is", null)
    .select("*");
  if (!updated || updated.length === 0) return { ok: false, error: "That re-roll already happened — reload." };
  revalidateGauntlet();
  return { ok: true, run: (updated as GauntletRunRow[])[0] };
}

/**
 * Walks away from a live run so a new one can be drafted. Between fights
 * this IS banking — the purse is paid — so it delegates to the bank
 * action. Mid-fight it pays NOTHING: the purse was on the table from the
 * first half, and leaving forfeits it. The entry fee stays in the week's
 * pot either way, and the score already won stands on the board exactly
 * as a fallen run's would.
 */
export async function resetGauntletRunAction(runId: number): Promise<ActionResult<{ score: number; paid: number }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active") return { ok: false, error: "That run is over." };
  if (canBank(run)) {
    const banked = await bankGauntletRunAction(runId);
    return banked.ok ? { ok: true, score: banked.run.score, paid: banked.paid } : banked;
  }

  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({
      status: "banked",
      relic_offer: null,
      crossroads: null,
      round_seed: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "active")
    .select("score");
  if (!updated || updated.length === 0) return { ok: false, error: "That run already ended." };

  revalidateGauntlet();
  return { ok: true, score: (updated as { score: number }[])[0].score, paid: 0 };
}

/**
 * THE SIXTH MAN's swap: one fielded card out, one shelf card in, once per
 * run, only between rounds. The lineup average stays FROZEN — the bracket
 * was priced at entry and a swap must not re-price it.
 */
export async function benchSwapGauntletAction(
  runId: number,
  outInventoryId: number,
  inInventoryId: number,
): Promise<ActionResult<{ run: GauntletRunRow }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active" || !run.relic_offer) {
    return { ok: false, error: "Swaps happen between rounds." };
  }
  if (!aggregateEffects(run.relics).benchSwap) return { ok: false, error: "THE SIXTH MAN isn't on your bench." };
  if (run.bench_swap_used) return { ok: false, error: "The sixth man already played." };

  const slot = run.lineup.findIndex((card) => card.inventoryId === outInventoryId);
  if (slot === -1) return { ok: false, error: "That card isn't fielded." };

  const { data } = await service
    .from("card_inventory")
    .select("id, discord_id, season, role, overall, foil, signed, edition_week, player_name, card")
    .eq("id", inInventoryId)
    .maybeSingle();
  const row = data as {
    id: number; discord_id: string; season: string; role: string; overall: number;
    foil: boolean; signed: boolean | null; edition_week: string; player_name: string; card: PlayerCardData;
  } | null;
  if (!row || row.discord_id !== user.discordId) return { ok: false, error: "That card isn't in your collection." };
  if (row.season !== run.season) return { ok: false, error: `${row.player_name} is from another season's shelf.` };
  if (row.card.moment || row.card.champWin || row.card.team) return { ok: false, error: `${row.player_name} is a relic — relics watch from the shelf.` };
  if (row.role !== run.lineup[slot].role) return { ok: false, error: `${row.player_name} doesn't play ${run.lineup[slot].role}.` };
  if (run.lineup.some((card) => card.inventoryId === row.id)) return { ok: false, error: "That card is already fielded." };

  const nextLineup = [...run.lineup];
  nextLineup[slot] = {
    inventoryId: row.id,
    name: row.player_name,
    role: run.lineup[slot].role,
    overall: row.overall,
    stats: Object.fromEntries((row.card.subStats ?? []).map((bar) => [bar.key, bar.value])),
    foil: row.foil,
    signed: row.signed === true,
    fresh: row.edition_week === mondayOf(new Date()),
    team: row.card.teamName ?? null,
  };

  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({ lineup: nextLineup, bench_swap_used: true, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("bench_swap_used", false)
    .select("*");
  if (!updated || updated.length === 0) return { ok: false, error: "That swap already happened." };

  revalidateGauntlet();
  return { ok: true, run: (updated as GauntletRunRow[])[0] };
}
