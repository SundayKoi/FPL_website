import { describe, expect, it } from "vitest";
import { GAUNTLET_ENTRY_FEE } from "./run";
import { PURSE_MAX, PURSE_STEPS, canBank, purseAfter, purseStep } from "./purse";

/** The curves the rulebook advertises for a player who reads the offers:
 *  the chance of having cleared N rounds. Round 1 at 94%, round 3 (and so
 *  reaching round 4) at 40%, the full eight at 5%; the rest interpolated
 *  geometrically. Used to hold the schedule to being a sink. */
const CLEAR_CHANCE = [0.94, 0.62, 0.4, 0.26, 0.17, 0.11, 0.075, 0.05];

describe("the purse schedule", () => {
  it("accumulates, one step per cleared round, to a fixed maximum", () => {
    expect(purseAfter(0)).toBe(0);
    expect(purseAfter(1)).toBe(10);
    expect(purseAfter(4)).toBe(48);
    expect(purseAfter(8)).toBe(PURSE_MAX);
    expect(purseAfter(12)).toBe(PURSE_MAX);
    expect(PURSE_STEPS.reduce((a, b) => a + b, 0)).toBe(PURSE_MAX);
    expect(purseStep(3)).toBe(12);
    expect(purseStep(9)).toBe(0);
  });

  it("grows faster the deeper the run goes, so pushing is always tempting", () => {
    for (let round = 2; round <= 8; round += 1) expect(purseStep(round)).toBeGreaterThanOrEqual(purseStep(round - 1));
  });

  it("returns less than the entry fee on average under EVERY stopping rule", () => {
    // Bank after round N: you are paid purseAfter(N) with the chance of
    // having got there. The best rule must still lose money on average —
    // the Gauntlet stays a sink, and the purse is a reason to stop, not
    // an income.
    for (let stopAfter = 1; stopAfter <= 8; stopAfter += 1) {
      const expected = purseAfter(stopAfter) * CLEAR_CHANCE[stopAfter - 1];
      expect(expected, `banking after round ${stopAfter}`).toBeLessThan(GAUNTLET_ENTRY_FEE * 0.5);
    }
  });
});

describe("canBank", () => {
  it("is between fights only", () => {
    expect(canBank({ status: "active", crossroads: null })).toBe(true);
    expect(canBank({ status: "active", crossroads: { state: {}, seed2: 1 } })).toBe(false);
    expect(canBank({ status: "fallen", crossroads: null })).toBe(false);
    expect(canBank({ status: "cleared", crossroads: null })).toBe(false);
  });
});
