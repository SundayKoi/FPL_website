import { describe, expect, it } from "vitest";
import { chaseCriteriaFromPreset, matchesChase } from "./chase";

const pull = (over: Partial<{ slug: string; tier: string; foil: boolean; foilType: string | null; signed: boolean; moment: boolean }> = {}) => ({
  card: {
    slug: over.slug ?? "doug-na1",
    tier: { key: over.tier ?? "gold" },
    moment: over.moment ? { id: 1 } : undefined,
  },
  foil: over.foil ?? false,
  foilType: over.foilType ?? null,
  signed: over.signed ?? false,
});

describe("matchesChase", () => {
  it("matches when every pinned criterion holds", () => {
    expect(matchesChase(pull({ foil: true, foilType: "ice" }), { foil: true, foilType: "ice" })).toBe(true);
  });

  it("empty criteria means any pull — the first card of the week takes it", () => {
    expect(matchesChase(pull(), {})).toBe(true);
  });

  it("misses on the wrong player", () => {
    expect(matchesChase(pull({ slug: "spies-na1" }), { slug: "doug-na1" })).toBe(false);
  });

  it("misses on the wrong tier", () => {
    expect(matchesChase(pull({ tier: "bronze" }), { tier: "diamond" })).toBe(false);
  });

  it("a foilType criterion implies foil", () => {
    expect(matchesChase(pull({ foil: false }), { foilType: "ice" })).toBe(false);
  });

  it("counts a legacy foil with no stored parallel as the prisma it is", () => {
    expect(matchesChase(pull({ foil: true, foilType: null }), { foilType: "prisma" })).toBe(true);
  });

  it("never lets a moment take the chase", () => {
    // A chase for "any pull" being eaten by the 2% moment would steal both
    // stories at once.
    expect(matchesChase(pull({ moment: true }), {})).toBe(false);
  });

  it("can demand a signed pull", () => {
    expect(matchesChase(pull({ signed: false }), { signed: true })).toBe(false);
    expect(matchesChase(pull({ signed: true, foil: true }), { signed: true })).toBe(true);
  });
});

describe("chaseCriteriaFromPreset", () => {
  it("builds each fixed preset", () => {
    expect(chaseCriteriaFromPreset("any")).toEqual({});
    expect(chaseCriteriaFromPreset("foil")).toEqual({ foil: true });
    expect(chaseCriteriaFromPreset("ice")).toEqual({ foilType: "ice" });
    expect(chaseCriteriaFromPreset("signed")).toEqual({ signed: true });
  });

  it("normalises the parameterised presets", () => {
    expect(chaseCriteriaFromPreset("player", "  Doug-NA1 ")).toEqual({ slug: "doug-na1" });
    expect(chaseCriteriaFromPreset("tier", "Diamond")).toEqual({ tier: "diamond" });
  });

  it("refuses a parameterised preset missing its parameter", () => {
    // Arming an accidental match-anything is worse than not arming.
    expect(chaseCriteriaFromPreset("player", "")).toBeNull();
    expect(chaseCriteriaFromPreset("tier")).toBeNull();
  });
});
