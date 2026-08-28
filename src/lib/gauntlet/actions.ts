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
import { revalidatePath } from "next/cache";
import { getBettingUser } from "@/lib/betting/wallet";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchAllCardSeasons } from "@/lib/cards/queries";
import type { PlayerCardData } from "@/lib/cards/build";
import type { MeasureKey } from "@/lib/cards/measures";
import { mondayOf } from "@/lib/packs/week";
import { aggregateEffects, offerRelics, RELIC_BY_KEY } from "./relics";
import { buildAutopsy } from "./autopsy";
import { CROSSROADS_BY_KEY } from "./crossroads";
import { generateOpponent, weekSeed } from "./opponents";
import { GAUNTLET_ENTRY_FEE, type GauntletRunRow, matchContextFor } from "./run";
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

  const thisWeek = mondayOf(new Date());
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
    if (row.role !== role) return { ok: false, error: `${row.player_name} doesn't play ${role}.` };
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
    });
  }

  const lineupAvg = lineup.reduce((sum, card) => sum + card.overall, 0) / lineup.length;

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
  // The cast is public, the dice are not: the opponent is seeded by the
  // WEEK so the whole league fights the same bracket, while the fight
  // itself resolves with this run's own CSPRNG seed.
  const opponent = generateOpponent(lineupAvg, 1, mulberry32(weekSeed(thisWeek, 1)));
  const { data: inserted, error: insertError } = await service
    .from("gauntlet_runs")
    .insert({
      discord_id: user.discordId,
      season,
      week_start: thisWeek,
      lineup,
      lineup_avg: lineupAvg,
      round_seed: seed,
      next_opponent: opponent,
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

  revalidateGauntlet();
  return { ok: true, run: inserted as GauntletRunRow };
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

  const ctx = matchContextFor(run.relics, run.next_opponent);
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
): Promise<ActionResult<{ result: MatchResult; run: GauntletRunRow }>> {
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

  const ctx = matchContextFor(run.relics, run.next_opponent);
  const sim = simulateSecondHalf(
    run.crossroads.state,
    choiceKey,
    run.lineup,
    run.next_opponent.cards,
    ctx,
    mulberry32(run.crossroads.seed2),
  );
  const score = roundScore(run.round, sim, run.lineup, ctx.effects);
  const result: MatchResult = { ...sim, score };
  // The read of the match, computed from the tape it just produced —
  // stored with it so a refresh redraws the same explanation.
  const autopsy = buildAutopsy(sim, run.crossroads.state.lanesWon);

  const cleared = sim.won && run.round >= GAUNTLET_ROUNDS;
  // The offer derives from the SAME stored seed (offset stream), so a
  // raced retry offers the same three relics.
  const offer =
    sim.won && !cleared ? offerRelics(run.relics, mulberry32(run.crossroads.seed2 + 1), run.round).map((r) => r.key) : null;

  const { data: updated } = await service
    .from("gauntlet_runs")
    .update({
      score: run.score + score,
      status: cleared ? "cleared" : sim.won ? "active" : "fallen",
      round: sim.won && !cleared ? run.round + 1 : run.round,
      relic_offer: offer,
      crossroads: null,
      next_opponent: sim.won ? null : run.next_opponent,
      last_result: { ...result, round: run.round, autopsy },
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "active")
    .eq("round", run.round)
    .is("relic_offer", null)
    .not("crossroads", "is", null)
    .select("*");

  if (!updated || updated.length === 0) {
    // Raced by our own double-click: the row already moved. Hand back what
    // it moved TO — the recomputed result is identical by construction
    // when the same choice raced; a different choice lost the CAS.
    const current = await loadOwnRun(service, runId, user.discordId);
    if (!current) return { ok: false, error: "That run isn't yours." };
    revalidateGauntlet();
    return { ok: true, result, run: current };
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
        description: `**${who}** cleared all eight rounds — final score **${(run.score + score).toLocaleString()}**.\nThe bracket is undefeated no more.`,
        color: GOLD,
      });
    } catch (error) {
      console.error("gauntlet: full-clear announce failed", error);
    }
  }

  revalidateGauntlet();
  return { ok: true, result, run: (updated as GauntletRunRow[])[0] };
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
  const opponent = generateOpponent(run.lineup_avg, run.round, mulberry32(weekSeed(run.week_start, run.round)));
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

  revalidateGauntlet();
  return { ok: true, run: (updated as GauntletRunRow[])[0] };
}

/**
 * Walks away from a live run so a new one can be drafted. Pays NOTHING:
 * no refund, no bonus, no reward of any kind — the entry fee stays in the
 * week's pot, and the score already won stands on the board exactly as a
 * fallen run's would. The Gauntlet's only payout is Monday's settlement.
 */
export async function resetGauntletRunAction(runId: number): Promise<ActionResult<{ score: number }>> {
  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in with Discord to use the betting site." };
  const service = createBettingServiceClient();
  const run = await loadOwnRun(service, runId, user.discordId);
  if (!run) return { ok: false, error: "That run isn't yours." };
  if (run.status !== "active") return { ok: false, error: "That run is over." };

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
  return { ok: true, score: (updated as { score: number }[])[0].score };
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
