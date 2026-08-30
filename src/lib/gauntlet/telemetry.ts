// The Gauntlet's balance tape: what was chosen, and how it went.
//
// Nothing on the run row survives long enough to answer a balance
// question. `crossroads` is nulled the moment the call resolves,
// `relic_offer` the moment a relic is taken, and `last_result` only ever
// holds the latest round. So each resolved round and each resolved offer
// writes one small append-only row here.
//
// Two rules govern every function in this file:
//   1. Telemetry never fails a fight. Every write is best-effort and
//      swallows its error — a player mid-run must not eat "couldn't
//      record" because a report table is missing or slow.
//   2. Telemetry never decides anything. Nothing in the engine reads
//      these rows; they exist to be aggregated by balance.ts and read by
//      a human, who then changes a number by hand.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GauntletRunRow } from "./run";
import type { MatchResult } from "./sim";

/** One resolved round, as the tape stores it. */
export interface RoundLogRow {
  run_id: number;
  season: string;
  week_start: string;
  round: number;
  lineup_avg: number;
  situation_key: string;
  choice_key: string;
  won: boolean;
  score: number;
  daring: number;
  momentum: number;
  relics: string[];
  opponent_avg: number | null;
  condition_key: string | null;
  boss_key: string | null;
  /** Which of the four dispositions they brought — null on a run staged
   *  before the plan shipped. */
  plan_key: string | null;
  /** The run you were standing in, when the opponent was a real one.
   *  Null against a generated team. This is the whole defence record. */
  ghost_run_id: number | null;
}

/** One resolved relic offer: three went out, one came back. */
export interface RelicOfferRow {
  run_id: number;
  season: string;
  week_start: string;
  round: number;
  offered: string[];
  taken: string;
  held: string[];
}

/**
 * The tape row for a call, built from the row the action already loaded.
 * Pure — the relics recorded are the ones the fight was FOUGHT with (the
 * pick that follows a win belongs to the next round's row).
 */
export function roundLogRow(
  run: GauntletRunRow,
  choiceKey: string,
  result: MatchResult,
): RoundLogRow {
  return {
    run_id: run.id,
    season: run.season,
    week_start: run.week_start,
    round: run.round,
    lineup_avg: run.lineup_avg,
    situation_key: run.crossroads?.state.situationKey ?? "",
    choice_key: choiceKey,
    won: result.won,
    score: Math.round(result.score),
    daring: Math.round(result.daring),
    momentum: Math.round(result.momentum),
    relics: run.relics,
    opponent_avg: run.next_opponent?.avg ?? null,
    condition_key: run.next_opponent?.condition ?? null,
    boss_key: run.next_opponent?.boss ?? null,
    plan_key: run.next_opponent?.plan ?? null,
    ghost_run_id: run.next_opponent?.ghost?.runId ?? null,
  };
}

/**
 * The tape row for an offer. `held` is what they already had when they
 * chose — a relic that only ever wins as the fourth ember is a different
 * card than one that carries a run alone, and the report can only tell
 * those apart if the denominator is written down.
 */
export function relicOfferRow(run: GauntletRunRow, taken: string): RelicOfferRow {
  return {
    run_id: run.id,
    season: run.season,
    week_start: run.week_start,
    round: run.round,
    offered: run.relic_offer ?? [],
    taken,
    held: run.relics,
  };
}

/** Best-effort insert. `on conflict do nothing` via ignoreDuplicates, so
 *  the double-click the CAS already lost cannot double-count the call. */
async function guard(table: string, run: () => PromiseLike<{ error: { message: string } | null }>) {
  try {
    const { error } = await run();
    // A missing table (migration not yet applied) is the expected miss and
    // must stay silent-ish: logged, never surfaced, never thrown.
    if (error) console.error(`gauntlet telemetry: ${table} write failed`, error.message);
  } catch (error) {
    console.error(`gauntlet telemetry: ${table} write threw`, error);
  }
}

const ONCE = { onConflict: "run_id,round", ignoreDuplicates: true } as const;

export function recordRound(service: SupabaseClient, row: RoundLogRow): Promise<void> {
  return guard("gauntlet_round_log", () => service.from("gauntlet_round_log").upsert(row, ONCE));
}

export function recordRelicOffer(service: SupabaseClient, row: RelicOfferRow): Promise<void> {
  return guard("gauntlet_relic_offers", () => service.from("gauntlet_relic_offers").upsert(row, ONCE));
}
