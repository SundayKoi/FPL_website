import { describe, it, expect } from "vitest";
import { projectedProfit, displayedShareA, americanOdds, LINE_SEED } from "./parimutuel";

describe("americanOdds", () => {
  it("favorite shows negative, underdog positive", () => {
    expect(americanOdds(0.62)).toBe("-163");
    expect(americanOdds(0.38)).toBe("+163");
    expect(americanOdds(0.5)).toBe("-100");
  });
});

describe("displayedShareA (line seed blend)", () => {
  it("with no line, returns the raw pool split", () => {
    expect(displayedShareA(4970, 3010, null)).toBeCloseTo(4970 / 7980, 5);
  });
  it("with no bets, returns the opening line", () => {
    expect(displayedShareA(0, 0, 0.6)).toBeCloseTo(0.6, 5);
  });
  it("blends toward the pool as money arrives", () => {
    // line says A=0.6 (seedA=600, seedB=400); pool says A is heavy
    const s = displayedShareA(LINE_SEED, 0, 0.6); // real volume == seed weight
    // (1000+600)/(1000+1000) = 0.8 — moved off the 0.6 line toward the money
    expect(s).toBeCloseTo(0.8, 5);
  });
  it("even line is 0.5 with no bets", () => {
    expect(displayedShareA(0, 0, 0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("projectedProfit", () => {
  it("matches the source CCS screenshot number", () => {
    // user stakes 4970; their side already holds 1000; opposing pool 3010.23.
    // 4970 * 3010.23 / (1000 + 4970) = 2506.00
    expect(projectedProfit(4970, 1000, 3010.23)).toBeCloseTo(2506.0, 1);
  });
  it("is 0 when stake is 0", () => {
    expect(projectedProfit(0, 1000, 1000)).toBe(0);
  });
});
