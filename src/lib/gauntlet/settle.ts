// The weekly settlement: the pot pays the board.
//
// Framework-free (any SupabaseClient) so the Monday drop script and any
// future admin button share one implementation. The invariants:
//
//   - The pot is what the week's entries paid, attempts × ENTRY_FEE, LESS
//     what the week's purses already paid out (bank-or-push, purse.ts) —
//     so prizes plus purses never exceed the fees.
//   - Prizes are SHARES of the pot (40/25/15% to the top three) and
//     scraps a flat crumb for everyone else who cleared round 4 — capped
//     so total payout never exceeds 95% of the pot. The Gauntlet stays a
//     sink league-wide, the same guardrail packs and dust live under.
//   - Idempotent by burn-first: the settlement row's primary-key insert
//     happens BEFORE any payout, so a re-run finds the week claimed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { GAUNTLET_ENTRY_FEE } from "./run";
import { weightedScore } from "./ascension";
import { DRAFTED_SCORE_MULT } from "./drafted";

const PRIZE_SHARES = [0.4, 0.25, 0.15] as const;
const SCRAP = 15;
/** Round a run must have REACHED for scraps — reaching 5 means round 4
 *  was cleared. */
const SCRAP_ROUND = 5;
const PAYOUT_CEILING = 0.95;

export interface GauntletStanding {
  discordId: string;
  username: string | null;
  /** The run's raw score. */
  score: number;
  /** The score as the board weighs it: 10% more per ascension level. */
  weighted: number;
  ascension: number;
  drafted: boolean;
  round: number;
  cleared: boolean;
  prize: number;
}

export interface SettlementResult {
  settled: boolean;
  reason?: string;
  pot: number;
  paid: number;
  standings: GauntletStanding[];
}

interface RunRow {
  discord_id: string;
  score: number;
  round: number;
  status: string;
  /** What the run's purse paid (0 on a run from before purses). */
  purse_paid?: number | null;
  /** The ascension the run was fought at (0 on a run from before). */
  ascension?: number | null;
  /** The five came from a dealt hand — the board pays it more. */
  drafted?: boolean | null;
}

/** The week's pot: the fees paid, less the purses already paid out of
 *  them. Never below zero, which the schedule (purse.test.ts) makes
 *  impossible anyway. */
export function gauntletPot(runs: Pick<RunRow, "purse_paid">[]): number {
  const fees = runs.length * GAUNTLET_ENTRY_FEE;
  const purses = runs.reduce((sum, run) => sum + Number(run.purse_paid ?? 0), 0);
  return Math.max(0, fees - purses);
}

/** Best run per user by WEIGHTED score, ranked — the same read the
 *  page's board uses. A level-3 run's points count 1.3 times. */
export function rankGauntletWeek(runs: RunRow[]): Omit<GauntletStanding, "username" | "prize">[] {
  const weigh = (run: RunRow) =>
    Math.round(weightedScore(run.score, Number(run.ascension ?? 0)) * (run.drafted ? DRAFTED_SCORE_MULT : 1));
  const best = new Map<string, RunRow>();
  for (const run of runs) {
    const held = best.get(run.discord_id);
    if (!held || weigh(run) > weigh(held)) best.set(run.discord_id, run);
  }
  return [...best.values()]
    .sort((a, b) => weigh(b) - weigh(a) || a.discord_id.localeCompare(b.discord_id))
    .map((run) => ({
      discordId: run.discord_id,
      score: run.score,
      weighted: weigh(run),
      ascension: Number(run.ascension ?? 0),
      drafted: run.drafted === true,
      round: run.round,
      cleared: run.status === "cleared",
    }));
}

export async function settleGauntletWeek(
  supabase: SupabaseClient,
  season: string,
  weekStart: string,
): Promise<SettlementResult> {
  const { data: runData, error: runError } = await supabase
    .from("gauntlet_runs")
    .select("discord_id, score, round, status, purse_paid, ascension, drafted")
    .eq("season", season)
    .eq("week_start", weekStart);
  if (runError) return { settled: false, reason: "gauntlet tables not migrated", pot: 0, paid: 0, standings: [] };
  const runs = (runData as RunRow[]) ?? [];
  if (runs.length === 0) return { settled: false, reason: "no runs", pot: 0, paid: 0, standings: [] };

  const pot = gauntletPot(runs);
  const ranked = rankGauntletWeek(runs);

  // Claim the week BEFORE paying: a conflict means it's already settled.
  const { error: claimError } = await supabase
    .from("gauntlet_settlements")
    .insert({ season, week_start: weekStart, pot });
  if (claimError) {
    return { settled: false, reason: "already settled", pot, paid: 0, standings: [] };
  }

  let paid = 0;
  const prizes = new Map<string, number>();
  ranked.slice(0, PRIZE_SHARES.length).forEach((standing, index) => {
    if (standing.weighted <= 0) return;
    const prize = Math.round(pot * PRIZE_SHARES[index]);
    if (prize > 0) prizes.set(standing.discordId, prize);
  });
  for (const standing of ranked.slice(PRIZE_SHARES.length)) {
    if (standing.round < SCRAP_ROUND && !standing.cleared) continue;
    if (paid + [...prizes.values()].reduce((a, b) => a + b, 0) + SCRAP > pot * PAYOUT_CEILING) break;
    prizes.set(standing.discordId, SCRAP);
  }

  for (const [discordId, amount] of prizes) {
    const reason = amount === SCRAP ? "gauntlet_scraps" : "gauntlet_prize";
    const { error } = await supabase.rpc("gauntlet_payout", {
      p_user: discordId,
      p_amount: amount,
      p_reason: reason,
    });
    // A single failed payout (deleted profile, say) must not sink the
    // rest — record what actually went out.
    if (!error) paid += amount;
    else console.error("gauntlet settle: payout failed", { discordId, amount, error });
  }

  await supabase
    .from("gauntlet_settlements")
    .update({ paid })
    .eq("season", season)
    .eq("week_start", weekStart);

  // Names for the embed, best-effort.
  const { data: nameData } = await supabase
    .from("betting_profiles")
    .select("discord_id, username")
    .in("discord_id", ranked.map((standing) => standing.discordId));
  const names = new Map(
    ((nameData as { discord_id: string; username: string | null }[]) ?? []).map((row) => [row.discord_id, row.username]),
  );

  return {
    settled: true,
    pot,
    paid,
    standings: ranked.map((standing) => ({
      ...standing,
      username: names.get(standing.discordId) ?? null,
      prize: prizes.get(standing.discordId) ?? 0,
    })),
  };
}
