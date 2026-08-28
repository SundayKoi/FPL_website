import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { PACK_COST } from "@/lib/packs/config";
import {
  briefFor,
  EXPEDITION_TIERS,
  expectedDailyDollars,
  MARK_RANK,
  rollOutcome,
  shineOf,
  squadMeets,
  squadShine,
} from "./config";

// A fixture, not a real row: shineOf reads seven of card_inventory's columns
// and a test that had to build a whole PlayerCardData to say "a gold card"
// would hide what each case is about. Keys are checked against CardCopy;
// values are deliberately loose so `card: { moment: {} }` can stand in for a
// pulled moment.
const copy = (over: Partial<Record<keyof CardCopy, unknown>> = {}) =>
  ({
    id: 1,
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    role: "Mid",
    card: {},
    ...over,
  }) as unknown as CardCopy;

describe("shineOf", () => {
  it("scores tier base by ladder index", () => {
    expect(shineOf(copy({ tier: "bronze" }))).toBe(1);
    expect(shineOf(copy({ tier: "challenger" }))).toBe(8);
  });
  it("adds parallel and signature bonuses", () => {
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "ice" }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", signed: true }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "prisma", signed: true }))).toBe(3 + 1 + 4);
  });
  it("scores relics and moments flat 6", () => {
    expect(shineOf(copy({ card: { champWin: {} } }))).toBe(6);
    expect(shineOf(copy({ card: { moment: {} } }))).toBe(6);
  });
  it("prices an unrecognized tier as the bottom of the ladder", () => {
    expect(shineOf(copy({ tier: "mythic" }))).toBe(1);
  });
  it("sums a squad", () => {
    expect(squadShine([copy({ tier: "bronze" }), copy({ tier: "gold" })])).toBe(1 + 3);
  });
});

describe("squadMeets", () => {
  it("legend needs 2 foils, 1 signed, shine 20", () => {
    const squad = [
      copy({ tier: "diamond", foil: true, foilType: "ice" }),      // 6+4 = 10
      copy({ tier: "master", foil: true, foilType: "refractor" }), // 7+3 = 10
      copy({ tier: "gold", signed: true }),                        // 3+4 = 7
    ];
    expect(squadMeets("legend", squad).ok).toBe(true);
  });
  it("reports every unmet requirement by name", () => {
    const { ok, reasons } = squadMeets("legend", [copy({}), copy({}), copy({})]);
    expect(ok).toBe(false);
    expect(reasons.join(" ")).toMatch(/foil/i);
    expect(reasons.join(" ")).toMatch(/signed/i);
    expect(reasons.join(" ")).toMatch(/shine/i);
  });
  it("rejects squads that are not exactly three", () => {
    expect(squadMeets("scout", [copy({}), copy({})]).ok).toBe(false);
  });
  it("lets any three cards run a scouting run", () => {
    const { ok, reasons } = squadMeets("scout", [copy({ tier: "bronze" }), copy({ tier: "bronze" }), copy({ tier: "bronze" })]);
    expect(ok).toBe(true);
    expect(reasons).toEqual([]);
  });
});

describe("EXPEDITION_TIERS", () => {
  it("gates harder the longer the run", () => {
    expect(EXPEDITION_TIERS.scout.durationHours).toBe(8);
    expect(EXPEDITION_TIERS.raid.durationHours).toBe(24);
    expect(EXPEDITION_TIERS.legend.durationHours).toBe(48);
    expect(EXPEDITION_TIERS.legend.minShine).toBeGreaterThan(EXPEDITION_TIERS.raid.minShine);
    expect(EXPEDITION_TIERS.raid.minShine).toBeGreaterThan(EXPEDITION_TIERS.scout.minShine);
  });
  it("pays under a pack a day at every tier, comps included", () => {
    // The balance guardrail: expeditions supplement the economy, never
    // replace it. See the arithmetic on REWARDS.
    expect(expectedDailyDollars("scout")).toBeCloseTo(90, 2);
    expect(expectedDailyDollars("raid")).toBeCloseTo(93.5, 2);
    expect(expectedDailyDollars("legend")).toBeCloseTo(128.75, 2);
    for (const tier of ["scout", "raid", "legend"] as const) {
      expect(expectedDailyDollars(tier)).toBeLessThan(PACK_COST);
    }
  });
  it("ranks marks worst to best", () => {
    expect(MARK_RANK.trail).toBeLessThan(MARK_RANK.sigil);
    expect(MARK_RANK.sigil).toBeLessThan(MARK_RANK.legend);
  });
});

describe("briefFor", () => {
  it("is deterministic per date and varies across dates", () => {
    expect(briefFor("2026-08-27")).toEqual(briefFor("2026-08-27"));
    const keys = new Set(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"].map((d) => briefFor(d).key));
    expect(keys.size).toBeGreaterThan(1);
  });
  it("names a role cards are actually printed with", () => {
    expect(["Top", "Jungle", "Mid", "Bot", "Support"]).toContain(briefFor("2026-08-27").role);
  });
});

describe("rollOutcome", () => {
  it("never pays below the tier floor and never marks above the tier ceiling", () => {
    for (let i = 0; i < 200; i += 1) {
      const out = rollOutcome("scout", 6, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", Math.random);
      expect(out.dollars).toBeGreaterThan(0);
      expect(out.mark === null || out.mark === "trail").toBe(true);
      expect(out.comp).toBe(false); // scout never comps
    }
  });
  it("legend jackpot carries the legend mark", () => {
    const out = rollOutcome("legend", 30, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", () => 0.999);
    // rand pinned high → jackpot branch (implement so the top of the range is jackpot)
    expect(out.grade).toBe("jackpot");
    expect(out.mark).toBe("legend");
  });
  it("applies the brief bonus when the squad satisfies it", () => {
    const brief = briefFor("2026-08-27");
    const withRole = rollOutcome("raid", 15, [{ role: brief.role }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    const without = rollOutcome("raid", 15, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    expect(withRole.briefHit).toBe(true);
    expect(withRole.dollars).toBeGreaterThan(without.dollars);
  });
  it("pins the bottom of the range to poor and pays more with shine", () => {
    const squad = [{ role: "X" }, { role: "X" }, { role: "X" }];
    const flat = rollOutcome("raid", 12, squad, "2026-08-27", () => 0);
    const shiny = rollOutcome("raid", 40, squad, "2026-08-27", () => 0);
    expect(flat.grade).toBe("poor");
    expect(shiny.dollars).toBeGreaterThan(flat.dollars);
    // The shine bonus caps at +50%, so a monster squad cannot run away with it.
    expect(shiny.dollars).toBe(Math.round(40 * 1.5));
  });
  it("consumes rand in a fixed order: grade, comp, mark", () => {
    const queue = [0.999, 0.5, 0.99];
    let used = 0;
    const rand = () => queue[used++] ?? 0;
    const out = rollOutcome("raid", 0, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", rand);
    expect(out.grade).toBe("jackpot");
    expect(out.comp).toBe(false); // 0.5 misses the 25% comp roll
    expect(out.mark).toBe(null);  // 0.99 misses the 30% sigil roll
    expect(used).toBe(3);
  });
  it("skips the rand a certain outcome does not need", () => {
    let used = 0;
    const rand = () => {
      used += 1;
      return 0; // poor grade: no comp chance, no mark chance
    };
    rollOutcome("scout", 0, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", rand);
    expect(used).toBe(1);
  });
});
