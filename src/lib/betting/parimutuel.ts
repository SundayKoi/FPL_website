// Pari-mutuel math ported from c:\fpl_gambling\web\src\lib\parimutuel.ts.
// DISPLAY ONLY — the `place_bet`/`_resolve_market` RPCs
// (supabase/migrations/20260813000003_betting_market_rpcs.sql) are the sole
// movers of money; nothing here is authoritative.

/** Live "Win payout +$X" projection: profit if your side wins.
 *  projected_profit = s * opposing_pool / (your_pool + s). */
export function projectedProfit(stake: number, yourPool: number, opposingPool: number): number {
  if (stake <= 0) return 0;
  return (stake * opposingPool) / (yourPool + stake);
}

// ---- odds display (DISPLAY ONLY — payouts are still the pool split) ----------

/** How much virtual stake the admin's opening line is worth, in points. The
 * line seeds the displayed odds at market open and decays in influence as real
 * money arrives (when real volume reaches LINE_SEED, the line is ~half weight). */
export const LINE_SEED = 1000;

/** Team A's displayed share of the pool (0..1), blending the admin opening line
 * (a probability for team A) with the live pools. With no line it's the raw pool
 * split; with no bets it's the line; in between it follows the money. */
export function displayedShareA(poolA: number, poolB: number, openLineProbA: number | null): number {
  const seedA = openLineProbA == null ? 0 : openLineProbA * LINE_SEED;
  const seedB = openLineProbA == null ? 0 : (1 - openLineProbA) * LINE_SEED;
  const total = poolA + poolB + seedA + seedB;
  if (total <= 0) return 0.5;
  return (poolA + seedA) / total;
}

/** Probability (0..1) -> American odds string, e.g. 0.62 -> "-163", 0.38 -> "+163". */
export function americanOdds(prob: number): string {
  if (prob <= 0) return "+∞";
  if (prob >= 1) return "-∞";
  if (prob >= 0.5) {
    return `-${Math.round((prob / (1 - prob)) * 100)}`;
  }
  return `+${Math.round(((1 - prob) / prob) * 100)}`;
}
