// Pure pool-aggregation helper. No market/odds SQL views exist in the source
// (c:\fpl_gambling\db\migrations has none — confirmed by Task 3's report) —
// pools are computed here from raw betting_bets rows, per the controller
// ruling: "pool per side = sum(amount) filtered by team_id/is_draw,
// unsettled." Kept side-effect free so it's cheap to reuse from both the
// server-side query layer (queries.ts) and the client-side realtime hook.

export interface PoolBetRow {
  team_id: number | null;
  is_draw: boolean;
  amount: number;
}

export interface Pools {
  poolA: number;
  poolB: number;
  poolDraw: number;
}

/** Sums unsettled stake per side for a market's bets. Settled bets (from a
 * resolved/cancelled market) are excluded by the caller's query, not here —
 * this just buckets whatever rows it's given. */
export function computePools(bets: PoolBetRow[], teamAId: number, teamBId: number): Pools {
  let poolA = 0;
  let poolB = 0;
  let poolDraw = 0;
  for (const bet of bets) {
    if (bet.is_draw) poolDraw += bet.amount;
    else if (bet.team_id === teamAId) poolA += bet.amount;
    else if (bet.team_id === teamBId) poolB += bet.amount;
  }
  return { poolA, poolB, poolDraw };
}
