import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOMENT_DUST } from "@/lib/cards/moments";
import {
  patronDustValue,
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
  MAX_DUST_BATCH,
  ALL_FOIL_TYPES,
  foilTypeOf,
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

  it("prices a mutation over the whole number, ink included", () => {
    const signedFoil = dustValueOf({ tier: "diamond", foil: true, signed: true });
    expect(dustValueOf({ tier: "diamond", foil: true, signed: true, mutation: "cursed" })).toBe(Math.round(signedFoil * 0.5));
    expect(dustValueOf({ tier: "diamond", foil: true, signed: true, mutation: "voidtouched" })).toBe(signedFoil * 2);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: false, mutation: "hardened" })).toBe(Math.round(DUST_VALUES.epic * 1.25));
    // The double-edged ones leave the price alone.
    expect(dustValueOf({ tier: "diamond", foil: false, signed: false, mutation: "irradiated" })).toBe(DUST_VALUES.epic);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: false, mutation: "haunted" })).toBe(DUST_VALUES.epic);
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

describe("patronDustValue", () => {
  it("pays patrons 20% more, rounded to whole dollars, and non-patrons exactly the table", () => {
    const common = { tier: "bronze", foil: false, signed: false } as const;
    expect(patronDustValue(common, false)).toBe(10);
    expect(patronDustValue(common, true)).toBe(12);
    // A rare (25) lands on a fraction — 30 exactly, but the rounding rule
    // is pinned here for any future retune.
    expect(patronDustValue({ tier: "platinum", foil: false, signed: false }, true)).toBe(30);
    // The bonus rides the TOTAL, autograph included.
    expect(patronDustValue({ tier: "bronze", foil: false, signed: true }, true)).toBe(Math.round(1210 * 1.2));
    // Still a burn: a pack's expected dust return stays under its cost.
    expect(Math.round(82 * 1.2)).toBeLessThan(200);
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
    // rare (25) x refractor (4.5) = 112.5, which would drift the ledger.
    const value = dustValueOf({ tier: "platinum", foil: true, foilType: "refractor", signed: false });
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBe(113);
  });

  it("pays the ladder in line with how thin it gets", () => {
    // The first cut paid Cracked Ice (1-in-33 of foils) only 2.5x a
    // Prisma (1-in-1.7). These are the corrected floors; lowering any of
    // them is a collector-facing price cut and should be deliberate.
    expect(FOIL_TYPE_DUST_MULT.aurora).toBeGreaterThanOrEqual(3);
    expect(FOIL_TYPE_DUST_MULT.refractor).toBeGreaterThanOrEqual(4.5);
    expect(FOIL_TYPE_DUST_MULT.ice).toBeGreaterThanOrEqual(6.5);
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

describe("the mass-dust cap", () => {
  it("is the one number three surfaces read", () => {
    // The server enforces it, the pack overlay and the shelf's select mode
    // both stop accepting at it. Restating it in any of the three is how
    // the expedition payout guard drifted from its config and refused
    // every legend jackpot — so this is the bridge.
    const action = readFileSync(join(process.cwd(), "src/lib/trades/actions.ts"), "utf8");
    expect(action).toContain("ids.length > MAX_DUST_BATCH");
    expect(action).not.toMatch(/ids\.length > \d+/);

    for (const file of ["src/components/cards/CollectionGrid.tsx"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).toContain("MAX_DUST_BATCH");
    }
  });

  it("is big enough for a shelf clear-out and small enough to be one request", () => {
    // Ten was sized for a five-card pack; the case that needed a batch was
    // always the collection. Each copy is still its own dust_card call
    // under its own lock, so this bounds one request's work — never the
    // safety of a single destroy.
    expect(MAX_DUST_BATCH).toBeGreaterThan(10);
    expect(MAX_DUST_BATCH).toBeLessThanOrEqual(100);
  });
});

describe("Eclipse, the one-of-one", () => {
  it("cannot be produced by any roll", () => {
    // THE safety property. Eclipse is absent from FOIL_TYPES, so
    // rollFoilType has no weight to draw and no branch to return it —
    // structural rather than a zero somebody could later edit to a one.
    expect(FOIL_TYPES as readonly string[]).not.toContain("eclipse");
    expect(Object.keys(FOIL_TYPE_WEIGHTS)).not.toContain("eclipse");
    for (let seed = 0; seed < 4000; seed += 1) {
      expect(rollFoilType(() => seed / 4000)).not.toBe("eclipse");
    }
  });

  it("still renders and labels like a parallel, but carries no dust price", () => {
    // A preview that had to bypass the real component would be proving
    // nothing about how the card actually looks. The multiplier is the one
    // place it parts from the other parallels: dust_card refuses an
    // Eclipse, so any price the table quoted would be an offer nobody can
    // take — the first one pulled sat above "$405" for a day.
    expect(ALL_FOIL_TYPES as readonly string[]).toContain("eclipse");
    expect(FOIL_TYPE_LABELS.eclipse).toBe("Eclipse");
    expect(FOIL_TYPE_DUST_MULT.eclipse).toBe(0);
  });

  it("reads back off a stored value rather than falling back to Prisma", () => {
    // card_inventory.foil_type is plain text. If foilTypeOf didn't know
    // the name, a stored Eclipse would render as an ordinary foil.
    expect(foilTypeOf("eclipse")).toBe("eclipse");
    expect(foilTypeOf("not-a-parallel")).toBe(DEFAULT_FOIL_TYPE);
  });

  it("keeps the mintable ladder exactly as it was", () => {
    // Nothing about the odds may move because a new look was added.
    expect([...FOIL_TYPES]).toEqual(["prisma", "aurora", "refractor", "ice"]);
    expect(FOIL_TYPE_WEIGHTS).toEqual({ prisma: 60, aurora: 25, refractor: 12, ice: 3 });
  });
});
