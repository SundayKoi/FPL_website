import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_DUST, eligibleForAutoDust, keepGroupOf, normalizeRule, selectAutoDust, type AutoDustCandidate, type AutoDustRule } from "./autoDust";

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

  it("never dusts a copy that came home from an expedition changed", () => {
    const plain = copy("a", "bronze", 30);
    const changed = copy("a", "bronze", 30, { mutation: "voidtouched" });
    const cursed = copy("a", "bronze", 30, { mutation: "cursed" });
    expect(eligibleForAutoDust(plain, rule)).toBe(true);
    expect(eligibleForAutoDust(changed, rule)).toBe(false);
    expect(eligibleForAutoDust(cursed, rule)).toBe(false);
    expect(selectAutoDust([plain, changed, cursed], rule, new Map())).toEqual([]);
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

  it("keeps one of each week's print when the rule says per edition, and one per player otherwise", () => {
    // Two prints of the same player, a week apart, both under the thresholds.
    const older = copy("doug", "bronze", 40, { editionWeek: "2026-08-17" });
    const newer = copy("doug", "bronze", 45, { editionWeek: "2026-08-24" });
    // Per player: the higher overall is kept and the older print goes.
    expect(selectAutoDust([older, newer], rule)).toEqual([older.id]);
    // Per edition: each week is its own group, so both are the one kept.
    expect(selectAutoDust([older, newer], { ...rule, perEdition: true })).toEqual([]);
    // A second copy of the SAME print is still an extra under either.
    const dupe = copy("doug", "bronze", 30, { editionWeek: "2026-08-24" });
    expect(selectAutoDust([older, newer, dupe], { ...rule, perEdition: true })).toEqual([dupe.id]);
  });

  it("counts the shelf behind a rip per edition when the rule does", () => {
    const pull = copy("doug", "bronze", 40, { editionWeek: "2026-08-24" });
    const perEdition = { ...rule, perEdition: true };
    // Last week's print on the shelf does not count against this week's keep…
    expect(selectAutoDust([pull], perEdition, new Map([["doug|2026-08-17", 1]]))).toEqual([]);
    // …but the same print does.
    expect(selectAutoDust([pull], perEdition, new Map([["doug|2026-08-24", 1]]))).toEqual([pull.id]);
    expect(keepGroupOf({ slug: "doug", editionWeek: "2026-08-24" }, perEdition)).toBe("doug|2026-08-24");
    expect(keepGroupOf({ slug: "doug", editionWeek: "2026-08-24" }, rule)).toBe("doug");
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
