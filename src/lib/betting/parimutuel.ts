// Pari-mutuel math ported from c:\fpl_gambling\web\src\lib\parimutuel.ts.
// DISPLAY ONLY — the `place_bet`/`_resolve_market` RPCs
// (supabase/migrations/20260813000003_betting_market_rpcs.sql) are the sole
// movers of money; nothing here is authoritative.

/** Share of the displayed pool for the side being staked on, with the pending stake folded in. */
export function displayedPercent(yourPool: number, opposingPool: number, stake: number): number {
  const total = yourPool + opposingPool + stake;
  if (total <= 0) return 0;
  return (yourPool + stake) / total;
}

/** Live "Win payout +$X" projection: profit if your side wins.
 *  projected_profit = s * opposing_pool / (your_pool + s). */
export function projectedProfit(stake: number, yourPool: number, opposingPool: number): number {
  if (stake <= 0) return 0;
  return (stake * opposingPool) / (yourPool + stake);
}

/** Authoritative settlement profit for a winning stake (floored, integer points). */
export function settlementProfit(stake: number, winningPool: number, losingPool: number): number {
  if (winningPool <= 0) return 0;
  return Math.floor((stake * losingPool) / winningPool);
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

/** Probability (0..1) -> decimal odds, e.g. 0.62 -> 1.61 (2dp). */
export function decimalOdds(prob: number): number {
  if (prob <= 0) return Infinity;
  return Math.round((1 / prob) * 100) / 100;
}

/** American odds (e.g. -150, +130) -> implied probability for that side (0..1).
 * Turns the admin's opening line into a seed probability. */
export function impliedProb(american: number): number {
  if (american < 0) return -american / (-american + 100);
  return 100 / (american + 100);
}
