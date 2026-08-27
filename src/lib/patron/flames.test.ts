import { describe, expect, it } from "vitest";
import { DEFAULT_PATRON_FLAME, flameUnlocked, PATRON_FLAMES, PATRON_FLAME_KEYS, patronFlameOf, SOVEREIGN_TENURE_DAYS } from "./flames";

describe("the flame wardrobe", () => {
  it("narrows a stored pick to a real flame", () => {
    expect(patronFlameOf("frostfire")).toBe("frostfire");
  });

  it("burns Ember for a patron who never picked", () => {
    expect(patronFlameOf(null)).toBe(DEFAULT_PATRON_FLAME);
    expect(patronFlameOf(undefined)).toBe(DEFAULT_PATRON_FLAME);
  });

  it("burns Ember for a pick the wardrobe no longer stocks", () => {
    // A wardrobe change must never strand a stored value.
    expect(patronFlameOf("plaid")).toBe(DEFAULT_PATRON_FLAME);
  });

  it("dresses every key completely", () => {
    for (const key of PATRON_FLAME_KEYS) {
      const style = PATRON_FLAMES[key];
      expect(style.label).toBeTruthy();
      expect(style.dash).toBeTruthy();
      expect(style.hot).toMatch(/^#/);
      expect(style.core).toMatch(/^#/);
    }
  });
});

describe("flameUnlocked", () => {
  it("gates Sovereign behind six months and leaves the rest free", () => {
    expect(flameUnlocked("sovereign", SOVEREIGN_TENURE_DAYS - 1)).toBe(false);
    expect(flameUnlocked("sovereign", SOVEREIGN_TENURE_DAYS)).toBe(true);
    expect(flameUnlocked("ember", 0)).toBe(true);
    expect(flameUnlocked("emberdrift", 0)).toBe(true);
    expect(flameUnlocked("crackedice", 0)).toBe(true);
  });
});
