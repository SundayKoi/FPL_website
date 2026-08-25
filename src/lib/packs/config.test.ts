import { describe, expect, it } from "vitest";
import { MOMENT_DUST } from "@/lib/cards/moments";
import {
  DUST_VALUES,
  DEFAULT_FOIL_TYPE,
  FOIL_DUST_MULT,
  FOIL_TYPES,
  FOIL_TYPE_DUST_MULT,
  FOIL_TYPE_LABELS,
  FOIL_TYPE_WEIGHTS,
  rollFoilType,
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

describe("foil parallels", () => {
  it("keeps Prisma as the base, so nothing already pulled changes value", () => {
    // Every foil minted before parallels existed is a Prisma. If this ever
    // stopped equalling FOIL_DUST_MULT, the migration's backfill would have
    // silently repriced real collections.
    expect(FOIL_TYPE_DUST_MULT.prisma).toBe(FOIL_DUST_MULT);
    expect(DEFAULT_FOIL_TYPE).toBe("prisma");
  });

  it("prices the ladder upward", () => {
    const mults = FOIL_TYPES.map((type) => FOIL_TYPE_DUST_MULT[type]);
    expect(mults).toEqual([...mults].sort((a, b) => a - b));
  });

  it("keeps the top of the ladder under a moment", () => {
    // A lucky foil roll must never outrank a performance that happened.
    const best = dustValueOf({ tier: "master", foil: true, foilType: "ice", signed: false });
    expect(best).toBeLessThan(MOMENT_DUST);
  });

  it("rarity falls as the look gets louder", () => {
    const weights = FOIL_TYPES.map((type) => FOIL_TYPE_WEIGHTS[type]);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
  });

  it("prices a copy by its parallel", () => {
    const base = dustValueOf({ tier: "diamond", foil: true, foilType: "prisma", signed: false });
    const chase = dustValueOf({ tier: "diamond", foil: true, foilType: "ice", signed: false });
    expect(chase).toBeGreaterThan(base);
    expect(chase).toBe(DUST_VALUES.epic * FOIL_TYPE_DUST_MULT.ice);
  });

  it("rounds a fractional multiplier — dust is whole numbers", () => {
    // rare (25) x aurora (2.5) = 62.5, which would drift the ledger.
    const value = dustValueOf({ tier: "platinum", foil: true, foilType: "aurora", signed: false });
    expect(Number.isInteger(value)).toBe(true);
  });

  it("prices a copy with no parallel recorded as the base foil", () => {
    // Copies pulled before the column existed, and anything the database
    // hands back that we do not recognise.
    const legacy = dustValueOf({ tier: "diamond", foil: true, signed: false });
    const junk = dustValueOf({ tier: "diamond", foil: true, foilType: "superfractor", signed: false });
    const prisma = dustValueOf({ tier: "diamond", foil: true, foilType: "prisma", signed: false });
    expect(legacy).toBe(prisma);
    expect(junk).toBe(prisma);
  });

  it("never prices a matte card as a foil, whatever type is attached", () => {
    expect(dustValueOf({ tier: "diamond", foil: false, foilType: "ice", signed: false })).toBe(DUST_VALUES.epic);
  });

  it("rolls the whole ladder, in weight order", () => {
    // Sweep the unit interval; the counts must rank exactly as the weights do.
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i += 1) {
      const type = rollFoilType(() => i / 10_000);
      counts[type] = (counts[type] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual([...FOIL_TYPES].sort());
    expect(FOIL_TYPES.map((t) => counts[t])).toEqual(
      [...FOIL_TYPES.map((t) => counts[t])].sort((a, b) => b - a),
    );
  });

  it("gives every parallel a label", () => {
    for (const type of FOIL_TYPES) expect(FOIL_TYPE_LABELS[type]).toBeTruthy();
  });
});
