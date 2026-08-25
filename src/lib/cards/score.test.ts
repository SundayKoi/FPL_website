import { describe, expect, it } from "vitest";
import { ROLE_SCORE_WEIGHTS, cardScore, scoreWeightsForRole, DEFAULT_SCORE_WEIGHTS } from "./build";
import { ROLE_BARS } from "./measures";
import type { MeasureKey } from "./measures";

const flat = (value: number): Record<MeasureKey, number> => ({
  combat: value,
  damage: value,
  economy: value,
  laning: value,
  vision: value,
  objectives: value,
  turrets: value,
  survival: value,
  presence: value,
  impact: value,
});

describe("ROLE_SCORE_WEIGHTS", () => {
  it("only ever weights bars the role actually wears", () => {
    // The whole point of the rewrite: a card is scored on what it shows.
    // A weight on a measure the card doesn't display would be invisible.
    for (const [role, weights] of Object.entries(ROLE_SCORE_WEIGHTS)) {
      const shown = new Set<string>(ROLE_BARS[role]);
      for (const key of Object.keys(weights)) {
        if (key === "win") continue;
        expect(shown.has(key), `${role} weights ${key}, which it does not display`).toBe(true);
      }
    }
  });

  it("weights every bar the role wears, so no bar is decoration", () => {
    for (const [role, bars] of Object.entries(ROLE_BARS)) {
      const weights = ROLE_SCORE_WEIGHTS[role] as Record<string, number> | undefined;
      if (!weights) continue;
      for (const bar of bars) {
        expect(weights[bar], `${role} displays ${bar} but does not score it`).toBeGreaterThan(0);
      }
    }
  });

  it("gives the jungle real credit for objectives", () => {
    // The single biggest thing the old formula missed.
    expect(ROLE_SCORE_WEIGHTS.JUNGLE.objectives).toBeGreaterThanOrEqual(15);
  });

  it("scores a support on vision and presence, not damage", () => {
    const support = ROLE_SCORE_WEIGHTS.UTILITY;
    expect(support.vision! + support.presence!).toBeGreaterThan(40);
    expect(support.impact!).toBeLessThan(support.vision!);
  });
});

describe("cardScore", () => {
  it("returns the shared value when every input agrees", () => {
    // A weighted mean of identical percentiles is that percentile, whatever
    // the weights are — the cheapest possible check that they normalise.
    for (const role of Object.keys(ROLE_SCORE_WEIGHTS)) {
      expect(cardScore(role, flat(70), 70)).toBeCloseTo(70, 6);
    }
    expect(cardScore("UNKNOWN_ROLE", flat(42), 42)).toBeCloseTo(42, 6);
  });

  it("moves the number when a bar the role scores moves", () => {
    const base = cardScore("JUNGLE", flat(50), 50);
    const better = cardScore("JUNGLE", { ...flat(50), objectives: 100 }, 50);
    expect(better).toBeGreaterThan(base);
  });

  it("ignores a measure the role doesn't wear", () => {
    // A support's turret damage is not part of being a good support.
    const base = cardScore("UTILITY", flat(50), 50);
    expect(cardScore("UTILITY", { ...flat(50), turrets: 100 }, 50)).toBeCloseTo(base, 6);
  });

  it("counts winning for every role", () => {
    for (const role of Object.keys(ROLE_SCORE_WEIGHTS)) {
      expect(cardScore(role, flat(50), 100)).toBeGreaterThan(cardScore(role, flat(50), 50));
    }
  });

  it("falls back to the default weights for an unrecognised role", () => {
    expect(scoreWeightsForRole("MADE_UP")).toBe(DEFAULT_SCORE_WEIGHTS);
    expect(scoreWeightsForRole(null)).toBe(DEFAULT_SCORE_WEIGHTS);
  });

  it("stays inside the 0-100 the OVR curve expects", () => {
    expect(cardScore("TOP", flat(0), 0)).toBe(0);
    expect(cardScore("TOP", flat(100), 100)).toBe(100);
  });
});
