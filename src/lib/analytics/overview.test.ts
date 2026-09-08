import { describe, expect, it } from "vitest";
import {
  cardsPerPack,
  classMix,
  dribbStatus,
  parallelMix,
  pullRates,
  rateRow,
  type PackWeek,
  type PullWeek,
} from "./overview";
import { DRIBB_COPIES } from "@/lib/cards/dribb";
import { FOIL_CHANCE, FOIL_TYPE_WEIGHTS, RARITY_WEIGHTS, SHINY_CHANCE } from "@/lib/packs/config";

const packWeek = (over: Partial<PackWeek> = {}): PackWeek => ({
  week: "2026-09-07",
  opens: 0,
  paid: 0,
  daily: 0,
  comp: 0,
  god_packs: 0,
  rippers: 0,
  spend: 0,
  ...over,
});

const pullWeek = (over: Partial<PullWeek> = {}): PullWeek => ({
  week: "2026-09-07",
  copies: 0,
  foil: 0,
  signed_copies: 0,
  shiny: 0,
  stattrak: 0,
  secret: 0,
  eclipse: 0,
  moment: 0,
  team: 0,
  champ: 0,
  dribb: 0,
  ...over,
});

describe("rateRow", () => {
  it("says THIN while the sample cannot tell the rates apart", () => {
    // Ninety cards, four foils: 4.4% observed against a 4% gate. Nobody
    // should touch anything on this, and the page must not imply they
    // should — this is the whole reason the verdict exists.
    const row = rateRow("foil", "Foil", 4, 90, FOIL_CHANCE);
    expect(row.verdict).toBe("thin");
    expect(row.low).toBeLessThan(FOIL_CHANCE);
    expect(row.high).toBeGreaterThan(FOIL_CHANCE);
  });

  it("calls a gate hot or cold once the sample is big enough to mean it", () => {
    // 12% foils over ten thousand cards is not luck.
    const hot = rateRow("foil", "Foil", 1200, 10_000, FOIL_CHANCE);
    expect(hot.verdict).toBe("high");
    expect(hot.observed).toBeCloseTo(0.12, 5);
    // And 1% over the same sample is a gate that has stopped firing.
    expect(rateRow("foil", "Foil", 100, 10_000, FOIL_CHANCE).verdict).toBe("low");
  });

  it("will not call a rare gate off on a handful of expected hits", () => {
    // A 1-in-128 gate over 200 cards expects 1.6 hits. Zero is completely
    // ordinary; four is a fun week. Neither is evidence.
    expect(rateRow("shiny", "Shiny", 0, 200, SHINY_CHANCE).verdict).toBe("thin");
    expect(rateRow("shiny", "Shiny", 4, 200, SHINY_CHANCE).verdict).toBe("thin");
    // Over a hundred thousand cards, zero Shinies IS evidence.
    expect(rateRow("shiny", "Shiny", 0, 100_000, SHINY_CHANCE).verdict).toBe("low");
  });

  it("survives an empty window without dividing by zero", () => {
    const row = rateRow("foil", "Foil", 0, 0, FOIL_CHANCE);
    expect(row.observed).toBe(0);
    expect(row.verdict).toBe("thin");
    expect(Number.isFinite(row.low) && Number.isFinite(row.high)).toBe(true);
  });
});

describe("pullRates", () => {
  const pulls = [pullWeek({ copies: 1000, foil: 40, shiny: 8, signed_copies: 5, dribb: 0 })];
  const packs = [packWeek({ opens: 200, god_packs: 0 })];

  it("divides per-card gates by cards and per-pack gates by packs", () => {
    const rates = pullRates(pulls, packs);
    const foil = rates.find((row) => row.key === "foil")!;
    expect(foil.per).toBe("card");
    expect(foil.sample).toBe(1000);
    expect(foil.observed).toBeCloseTo(0.04, 5);
    // The God Pack is one roll per pack, so 200 is its sample — dividing it
    // by cards would report the gate as five times rarer than it is.
    const god = rates.find((row) => row.key === "god")!;
    expect(god.per).toBe("pack");
    expect(god.sample).toBe(200);
    // The Dribb is counted in cards (a copy is minted) but gated per pack.
    const dribb = rates.find((row) => row.key === "dribb")!;
    expect(dribb.per).toBe("pack");
    expect(dribb.sample).toBe(200);
  });

  it("covers every gate the opener rolls", () => {
    expect(pullRates(pulls, packs).map((row) => row.key).sort()).toEqual(
      ["dribb", "foil", "god", "moment", "secret", "shiny", "signed", "stattrak", "team"],
    );
  });
});

describe("classMix", () => {
  it("reads the mix off the tiers, and expects the config's weights", () => {
    // bronze/silver/gold are all common; platinum/emerald rare; diamond
    // epic; master/challenger legendary (RARITY_BY_TIER).
    const mix = classMix([
      { tier: "bronze", copies: 60 },
      { tier: "gold", copies: 22 },
      { tier: "emerald", copies: 15 },
      { tier: "diamond", copies: 2 },
      { tier: "challenger", copies: 1 },
    ]);
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    const common = mix.find((row) => row.klass === "common")!;
    expect(common.expected).toBeCloseTo(RARITY_WEIGHTS.common / total, 6);
    expect(common.observed).toBeCloseTo(0.82, 6);
    expect(mix.find((row) => row.klass === "rare")!.observed).toBeCloseTo(0.15, 6);
    expect(mix.find((row) => row.klass === "epic")!.observed).toBeCloseTo(0.02, 6);
    expect(mix.find((row) => row.klass === "legendary")!.observed).toBeCloseTo(0.01, 6);
    // Every class is present even at zero, so the table never loses a row.
    expect(mix.map((row) => row.klass)).toEqual(["common", "rare", "epic", "legendary"]);
  });

  it("leaves moments, plates and the Dribb out of the player-card mix", () => {
    // These file under their own tiers and are not drawn from the class
    // table at all; counting them would drag every share off.
    const mix = classMix([
      { tier: "bronze", copies: 50 },
      { tier: "moment", copies: 50 },
      { tier: "dribb", copies: 5 },
    ]);
    expect(mix.find((row) => row.klass === "common")!.observed).toBe(1);
  });

  it("is all zeroes rather than NaN on an empty window", () => {
    for (const row of classMix([])) {
      expect(row.observed).toBe(0);
      expect(Number.isFinite(row.expected)).toBe(true);
    }
  });
});

describe("parallelMix", () => {
  it("measures the ladder against its weights and marks the Eclipse as off it", () => {
    const mix = parallelMix([
      { foil_type: "prisma", copies: 70 },
      { foil_type: "aurora", copies: 20 },
      { foil_type: "refractor", copies: 8 },
      { foil_type: "ice", copies: 2 },
      { foil_type: "eclipse", copies: 1 },
    ]);
    const weights = Object.values(FOIL_TYPE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(mix.find((row) => row.type === "prisma")!.expected).toBeCloseTo(FOIL_TYPE_WEIGHTS.prisma / weights, 6);
    // The Eclipse comes through its own gate and has no ladder weight —
    // and it must not be in the denominator either.
    expect(mix.find((row) => row.type === "eclipse")!.expected).toBeNull();
    expect(mix.find((row) => row.type === "prisma")!.observed).toBeCloseTo(0.7, 6);
  });
});

describe("dribbStatus", () => {
  it("counts down from five and never past it", () => {
    expect(dribbStatus(0)).toEqual({ found: 0, left: DRIBB_COPIES, complete: false });
    expect(dribbStatus(2)).toEqual({ found: 2, left: DRIBB_COPIES - 2, complete: false });
    expect(dribbStatus(DRIBB_COPIES)).toEqual({ found: DRIBB_COPIES, left: 0, complete: true });
    // A sixth cannot exist, and if the count ever said so the page still
    // must not render "-1 still in the packs".
    expect(dribbStatus(9)).toEqual({ found: DRIBB_COPIES, left: 0, complete: true });
  });
});

describe("cardsPerPack", () => {
  it("is the sanity check on every per-card denominator", () => {
    expect(cardsPerPack([pullWeek({ copies: 1000 })], [packWeek({ opens: 200 })])).toBe(5);
    expect(cardsPerPack([], [])).toBe(0);
  });
});
