import { describe, expect, it } from "vitest";
import { ROLE_SCORE_WEIGHTS, cardScore, scoreWeightsForRole, DEFAULT_SCORE_WEIGHTS } from "./build";
import { ROLE_BARS } from "./measures";
import type { MeasureKey } from "./measures";

/** Every measure at `value`. */
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

/** The middle of the pack, with the named measures moved. */
const full = (overrides: Partial<Record<MeasureKey, number>>): Record<MeasureKey, number> => ({
  ...flat(50),
  ...overrides,
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
    expect(support.vision! + support.presence!).toBeGreaterThanOrEqual(40);
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

  it("ranks a 2-0 week above a 0-2 week, even against inflated shares", () => {
    // The bug this exists to prevent, from a real week: a mid who lost 0-2
    // out-rated a mid who won 2-0.
    //
    // Several measures are SHARES of a team's totals, and a share is
    // anti-correlated with winning — a stomp spreads kills and damage over
    // five players, while a loss concentrates them in whoever kept trying.
    // So the losing mid posts a huge damage share, kill participation and
    // impact, and the winning mid's numbers look ordinary.
    const stomped = full({ combat: 60, damage: 45, laning: 70, presence: 40, impact: 42 });
    const carriedALoss = full({ combat: 55, damage: 95, laning: 50, presence: 85, impact: 92 });

    expect(cardScore("MIDDLE", stomped, 100)).toBeGreaterThan(cardScore("MIDDLE", carriedALoss, 0));
  });

  it("weights winning heavily enough for every role to survive that case", () => {
    // Same shape as above, applied across the board: the shares are the
    // story of HOW someone played, not whether it worked.
    const modestWinner = full({});
    const inflatedLoser = full({
      combat: 90, damage: 95, laning: 90, presence: 95,
      impact: 95, objectives: 90, turrets: 90, vision: 90, survival: 90, economy: 90,
    });
    for (const role of Object.keys(ROLE_SCORE_WEIGHTS)) {
      // A 50th-percentile winner should not be beaten by a 90th-percentile
      // loser by much — and must not be beaten by a landslide.
      const gap = cardScore(role, inflatedLoser, 0) - cardScore(role, modestWinner, 100);
      expect(gap, `${role} lets a losing week run away with it`).toBeLessThan(10);
    }
  });

  it("pays a 2-0 week the same in every role, however crowded it is", () => {
    // The win term takes the RAW winrate, so 100 means 2-0 everywhere.
    // Percentiling it made the same result worth 95 in a role where two
    // players went 2-0 and 77 where six did — which is what left whole
    // roles topping out ten OVR below others.
    const scores = Object.keys(ROLE_SCORE_WEIGHTS).map((role) => cardScore(role, flat(80), 100));
    for (const score of scores) expect(score).toBeCloseTo(scores[0], 6);
  });

  it("reads a 1-1 week as the middle and a 0-2 as the floor", () => {
    const bars = flat(80);
    expect(cardScore("TOP", bars, 100)).toBeGreaterThan(cardScore("TOP", bars, 50));
    expect(cardScore("TOP", bars, 50)).toBeGreaterThan(cardScore("TOP", bars, 0));
  });

  it("stays inside the 0-100 the OVR curve expects", () => {
    expect(cardScore("TOP", flat(0), 0)).toBe(0);
    expect(cardScore("TOP", flat(100), 100)).toBe(100);
  });
});
