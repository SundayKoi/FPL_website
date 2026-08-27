// The weekly settlement: the pot pays the board.
//
// Framework-free (any SupabaseClient) so the Monday drop script and any
// future admin button share one implementation. The invariants:
//
//   - The pot is what the week's entries paid: attempts × ENTRY_FEE.
//   - Prizes are SHARES of the pot (40/25/15% to the top three) and
//     scraps a flat crumb for everyone else who cleared round 4 — capped
//     so total payout never exceeds 95% of the pot. The Gauntlet stays a
//     sink league-wide, the same guardrail packs and dust live under.
//   - Idempotent by burn-first: the settlement row's primary-key insert
//     happens BEFORE any payout, so a re-run finds the week claimed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { GAUNTLET_ENTRY_FEE } from "./run";

const PRIZE_SHARES = [0.4, 0.25, 0.15] as const;
const SCRAP = 15;
/** Round a run must have REACHED for scraps — reaching 5 means round 4
 *  was cleared. */
const SCRAP_ROUND = 5;
const PAYOUT_CEILING = 0.95;

export interface GauntletStanding {
  discordId: string;
  username: string | null;
  score: number;
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
}

/** Best run per user, ranked — the same read the page's board uses. */
export function rankGauntletWeek(runs: RunRow[]): Omit<GauntletStanding, "username" | "prize">[] {
  const best = new Map<string, RunRow>();
  for (const run of runs) {
    const held = best.get(run.discord_id);
    if (!held || run.score > held.score) best.set(run.discord_id, run);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.discord_id.localeCompare(b.discord_id))
    .map((run) => ({
      discordId: run.discord_id,
      score: run.score,
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
    .select("discord_id, score, round, status")
    .eq("season", season)
    .eq("week_start", weekStart);
  if (runError) return { settled: false, reason: "gauntlet tables not migrated", pot: 0, paid: 0, standings: [] };
  const runs = (runData as RunRow[]) ?? [];
  if (runs.length === 0) return { settled: false, reason: "no runs", pot: 0, paid: 0, standings: [] };

  const pot = runs.length * GAUNTLET_ENTRY_FEE;
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
    if (standing.score <= 0) return;
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
