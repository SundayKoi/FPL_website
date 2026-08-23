import { describe, expect, it } from "vitest";
import {
  DUST_VALUES,
  FOIL_DUST_MULT,
  PACK_COST,
  PACK_SIZE,
  RARITY_WEIGHTS,
  SIGNED_DUST_MULT,
  dustValueOf,
} from "./config";

describe("dustValueOf", () => {
  it("pays the flat class value for a plain copy", () => {
    expect(dustValueOf({ tier: "bronze", foil: false, signed: false })).toBe(DUST_VALUES.common);
    expect(dustValueOf({ tier: "gold", foil: false, signed: false })).toBe(DUST_VALUES.common);
    expect(dustValueOf({ tier: "emerald", foil: false, signed: false })).toBe(DUST_VALUES.rare);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: false })).toBe(DUST_VALUES.epic);
    expect(dustValueOf({ tier: "challenger", foil: false, signed: false })).toBe(DUST_VALUES.legendary);
  });

  it("stacks the foil and signed multipliers multiplicatively", () => {
    expect(dustValueOf({ tier: "diamond", foil: true, signed: false })).toBe(DUST_VALUES.epic * FOIL_DUST_MULT);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: true })).toBe(DUST_VALUES.epic * SIGNED_DUST_MULT);
    expect(dustValueOf({ tier: "challenger", foil: true, signed: true })).toBe(
      DUST_VALUES.legendary * FOIL_DUST_MULT * SIGNED_DUST_MULT,
    );
  });

  it("dusts an unrecognized tier as common rather than throwing", () => {
    expect(dustValueOf({ tier: "unobtainium", foil: false, signed: false })).toBe(DUST_VALUES.common);
  });

  it("keeps a pack's expected dust well under what the pack costs", () => {
    // The invariant the values are chosen for: dusting is a floor for dupes,
    // not a way to farm the store. Guard rails, so a balance pass that makes
    // packs profitable to shred has to break a test to do it.
    const totalWeight = Object.values(RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    const perSlot = (Object.keys(RARITY_WEIGHTS) as (keyof typeof RARITY_WEIGHTS)[]).reduce(
      (sum, rarity) => sum + (RARITY_WEIGHTS[rarity] / totalWeight) * DUST_VALUES[rarity],
      0,
    );
    const perPack = perSlot * PACK_SIZE;

    expect(Math.round(perPack)).toBe(82);
    expect(perPack / PACK_COST).toBeLessThan(0.5);
  });
});
