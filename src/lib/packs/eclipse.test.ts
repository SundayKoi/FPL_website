// The Eclipse gate, as a set of claims about the numbers rather than about
// the code — these are the decisions, and a change to any of them should
// have to argue with a test first.
import { describe, expect, it } from "vitest";
import {
  ALL_FOIL_TYPES,
  CHASE_FOIL_TYPES,
  ECLIPSE_CHANCE,
  ECLIPSE_FOIL_TYPE,
  FOIL_TYPES,
  FOIL_TYPE_WEIGHTS,
  rollFoilType,
} from "./config";

describe("Eclipse is outside the foil ladder", () => {
  it("has no weight, so no ordinary foil roll can produce one", () => {
    // The guarantee is structural. There is no weight to draw, so this
    // cannot be undone by a tuning pass on the weights table.
    expect(Object.keys(FOIL_TYPE_WEIGHTS)).not.toContain(ECLIPSE_FOIL_TYPE);
    expect(FOIL_TYPES as readonly string[]).not.toContain(ECLIPSE_FOIL_TYPE);
  });

  it("is never returned by rollFoilType, at any point in the stream", () => {
    for (let i = 0; i < 2000; i++) {
      expect(rollFoilType(() => i / 2000)).not.toBe(ECLIPSE_FOIL_TYPE);
    }
  });

  it("still renders like any other parallel", () => {
    expect(ALL_FOIL_TYPES).toContain(ECLIPSE_FOIL_TYPE);
    expect(CHASE_FOIL_TYPES).toContain(ECLIPSE_FOIL_TYPE);
  });
});

describe("the drop rate is the one that was agreed", () => {
  it("is half a percent of Card-of-the-Week pulls", () => {
    expect(ECLIPSE_CHANCE).toBe(0.005);
  });

  it("works out at roughly one Eclipse per thousand-odd packs", () => {
    // The gate in front of the rate is what makes the number small. A Card
    // of the Week is the top card in each role, and the roller picks
    // uniformly inside a rarity class, so it lands in a few percent of
    // slots. Both ends of the plausible range are checked, because a league
    // getting more top-heavy moves this on its own.
    const perPack = (gate: number) => 1 - (1 - gate * ECLIPSE_CHANCE) ** 5;
    const thin = 1 / perPack(0.044);
    const typical = 1 / perPack(0.021);
    expect(Math.round(thin)).toBeGreaterThan(500);
    expect(Math.round(typical)).toBeLessThan(4000);
    // And the headline claim: rare, but not once-a-decade rare.
    expect(Math.round(thin)).toBeLessThan(2000);
    expect(Math.round(typical)).toBeGreaterThan(800);
  });

  it("is rare enough that a season of packs usually yields at most one", () => {
    // 150 packs a week for ten weeks, at the more generous gate.
    const perPack = 1 - (1 - 0.044 * ECLIPSE_CHANCE) ** 5;
    expect(1500 * perPack).toBeLessThan(3);
    // ...but not so rare that it probably never happens at all.
    expect(1500 * perPack).toBeGreaterThan(0.5);
  });
});
