import { describe, expect, it } from "vitest";
import {
  ASCENSION_LEVELS,
  ASCENSION_MAX,
  ascensionBadge,
  ascensionPurseMult,
  ascensionRules,
  clampAscension,
  unlockedByClear,
  weightedScore,
} from "./ascension";
import { GHOST_RELIC_POTENCY, GHOST_TARGET_RELIEF } from "./ghosts";

describe("ascensionRules", () => {
  it("is the Gauntlet as it shipped at level 0", () => {
    expect(ascensionRules(0)).toEqual({
      level: 0,
      gateRounds: [4],
      ghostPotency: GHOST_RELIC_POTENCY,
      ghostRelief: GHOST_TARGET_RELIEF,
      offerSize: 3,
      bracketBump: 0,
      holdsPit: false,
    });
  });

  it("is cumulative — every level carries the ones below it", () => {
    expect(ascensionRules(1).gateRounds).toEqual([3, 6]);
    expect(ascensionRules(2)).toMatchObject({ gateRounds: [3, 6], ghostPotency: 1, ghostRelief: 0, offerSize: 3 });
    expect(ascensionRules(3)).toMatchObject({ ghostPotency: 1, offerSize: 2, bracketBump: 0 });
    expect(ascensionRules(4)).toMatchObject({ offerSize: 2, bracketBump: 3, holdsPit: false });
    expect(ascensionRules(5)).toMatchObject({ bracketBump: 3, holdsPit: true });
  });

  it("has one printed rule per level, and stops at the top", () => {
    expect(ASCENSION_LEVELS.map((entry) => entry.level)).toEqual([1, 2, 3, 4, 5]);
    expect(ASCENSION_MAX).toBe(5);
    expect(ascensionRules(9).level).toBe(5);
    expect(ascensionRules(-2).level).toBe(0);
  });
});

describe("the ladder's arithmetic", () => {
  it("clamps a pick to what is unlocked", () => {
    expect(clampAscension(3, 1)).toBe(1);
    expect(clampAscension(1, 3)).toBe(1);
    expect(clampAscension(2.7, 5)).toBe(2);
    expect(clampAscension(-1, 5)).toBe(0);
    expect(clampAscension(4, 99)).toBe(4);
  });

  it("weighs the board and the purse by 10% a level", () => {
    expect(weightedScore(1000, 0)).toBe(1000);
    expect(weightedScore(1000, 3)).toBe(1300);
    expect(weightedScore(1000, 9)).toBe(1500);
    expect(ascensionPurseMult(2)).toBeCloseTo(1.2);
  });

  it("unlocks one level per clear, never past the top", () => {
    expect(unlockedByClear(0)).toBe(1);
    expect(unlockedByClear(4)).toBe(5);
    expect(unlockedByClear(5)).toBe(5);
  });

  it("badges every level but zero", () => {
    expect(ascensionBadge(0)).toBe("");
    expect(ascensionBadge(3)).toBe("A3");
  });
});
