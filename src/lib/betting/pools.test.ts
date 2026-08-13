import { describe, it, expect } from "vitest";
import { computePools } from "./pools";

describe("computePools", () => {
  it("sums stake per team and buckets draws separately", () => {
    const bets = [
      { team_id: 1, is_draw: false, amount: 100 },
      { team_id: 1, is_draw: false, amount: 50 },
      { team_id: 2, is_draw: false, amount: 30 },
      { team_id: null, is_draw: true, amount: 20 },
    ];
    expect(computePools(bets, 1, 2)).toEqual({ poolA: 150, poolB: 30, poolDraw: 20 });
  });

  it("returns all zeros for no bets", () => {
    expect(computePools([], 1, 2)).toEqual({ poolA: 0, poolB: 0, poolDraw: 0 });
  });

  it("ignores bets on teams outside this market", () => {
    const bets = [{ team_id: 99, is_draw: false, amount: 500 }];
    expect(computePools(bets, 1, 2)).toEqual({ poolA: 0, poolB: 0, poolDraw: 0 });
  });
});
