import { describe, expect, it } from "vitest";
import {
  DUST_VALUES,
  FOIL_DUST_MULT,
  PACK_COST,
  PACK_SIZE,
  RARITY_WEIGHTS,
  SIGNED_DUST_BASE,
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

  it("doubles a foil and adds the flat autograph bonus on top", () => {
    expect(dustValueOf({ tier: "diamond", foil: true, signed: false })).toBe(DUST_VALUES.epic * FOIL_DUST_MULT);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: true })).toBe(DUST_VALUES.epic + SIGNED_DUST_BASE);
    expect(dustValueOf({ tier: "challenger", foil: true, signed: true })).toBe(
      DUST_VALUES.legendary * FOIL_DUST_MULT + SIGNED_DUST_BASE,
    );
  });

  it("lets the signature dominate: signed copies price within a hair of each other", () => {
    // The autograph is exactly as rare on a bronze as on a challenger, so a
    // signed bronze must not read as junk next to a signed challenger.
    const bronze = dustValueOf({ tier: "bronze", foil: true, signed: true });
    const challenger = dustValueOf({ tier: "challenger", foil: true, signed: true });
    expect(bronze).toBeGreaterThan(DUST_VALUES.legendary * FOIL_DUST_MULT);
    expect(challenger / bronze).toBeLessThan(1.5);
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
