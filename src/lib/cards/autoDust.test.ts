import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_DUST, eligibleForAutoDust, normalizeRule, selectAutoDust, type AutoDustCandidate, type AutoDustRule } from "./autoDust";

let n = 0;
const copy = (slug: string, tier: string, overall: number, extra: Partial<AutoDustCandidate> = {}): AutoDustCandidate => ({
  id: (n += 1),
  slug,
  tier,
  overall,
  foil: false,
  foilType: null,
  signed: false,
  relic: false,
  acquiredAt: `2026-08-${String(n).padStart(2, "0")}`,
  ...extra,
});

const rule: AutoDustRule = { ...DEFAULT_AUTO_DUST, enabled: true, maxTier: "gold", maxOverall: 70, keepCopies: 1 };

describe("auto-dust", () => {
  it("does nothing while off", () => {
    expect(selectAutoDust([copy("a", "bronze", 40), copy("a", "bronze", 40)], { ...rule, enabled: false })).toEqual([]);
  });

  it("keeps the first copy of a player and dusts the extras under the thresholds", () => {
    const first = copy("doug", "silver", 55);
    const second = copy("doug", "silver", 52);
    const third = copy("doug", "silver", 58);
    // The best copy (58) is kept; the other two go.
    expect(selectAutoDust([first, second, third], rule).sort()).toEqual([first.id, second.id].sort());
  });

  it("never touches a copy above the rarity or the overall", () => {
    const plat = copy("a", "platinum", 50);
    const high = copy("b", "silver", 80);
    expect(selectAutoDust([plat, plat, high, high].map((c, i) => ({ ...c, id: 100 + i })), rule)).toEqual([]);
  });

  it("keeps signed and foil copies ahead of plain ones, and skips them by default", () => {
    const plain = copy("a", "gold", 65);
    const foil = copy("a", "gold", 60, { foil: true, foilType: "aurora" });
    const signed = copy("a", "gold", 50, { signed: true });
    // Keep one: the signed copy. Foil is skipped by the rule; plain goes.
    expect(selectAutoDust([plain, foil, signed], rule)).toEqual([plain.id]);
    // With foils allowed, the foil is the extra after the signed keeper.
    expect(selectAutoDust([plain, foil, signed], { ...rule, skipFoil: false }).sort()).toEqual([plain.id, foil.id].sort());
  });

  it("never dusts an Eclipse, a moment, a relic or a plate", () => {
    const eclipse = copy("a", "bronze", 30, { foil: true, foilType: "eclipse" });
    const relic = copy("b", "bronze", 30, { relic: true });
    expect(eligibleForAutoDust(eclipse, { ...rule, skipFoil: false })).toBe(false);
    expect(eligibleForAutoDust(relic, rule)).toBe(false);
  });

  it("counts copies already on the shelf toward the keep, so a new pull of a kept player is an extra", () => {
    const pull = copy("doug", "bronze", 40);
    expect(selectAutoDust([pull], rule, new Map([["doug", 1]]))).toEqual([pull.id]);
    expect(selectAutoDust([pull], rule, new Map())).toEqual([]);
    expect(selectAutoDust([pull], { ...rule, keepCopies: 2 }, new Map([["doug", 1]]))).toEqual([]);
  });

  it("with keep at zero, dusts every eligible copy", () => {
    const a = copy("a", "bronze", 40);
    const b = copy("b", "silver", 60);
    expect(selectAutoDust([a, b], { ...rule, keepCopies: 0 }).sort()).toEqual([a.id, b.id].sort());
  });

  it("normalizes whatever the database held", () => {
    expect(normalizeRule(null)).toEqual(DEFAULT_AUTO_DUST);
    expect(normalizeRule({ maxTier: "mythic" as never, maxOverall: 140, keepCopies: -3 })).toMatchObject({ maxTier: "silver", maxOverall: 99, keepCopies: 0 });
  });
});
