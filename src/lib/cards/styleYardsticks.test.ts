import { describe, expect, it } from "vitest";
import type { StyleYardstick } from "./styleRating";
import { LEGACY_RATING_SEASONS, ratesByPlaystyle, styleYardstickFor, type StyleYardstickFile } from "./styleYardsticks";
import generated from "./styleYardsticks.json";

const stub = (league: "premier" | "academy", history: string[]): StyleYardstick => ({
  league,
  history,
  games: 1,
  curve: { base: 20, scale: 0.8 },
  distributions: {},
  offsets: {},
});

const FILE: StyleYardstickFile = {
  about: "test",
  seasons: { S6: stub("premier", ["S1", "S5"]), A2: stub("academy", ["A1"]) },
};

describe("which seasons are rated by playstyle", () => {
  it("never touches a season printed before the style rating existed", () => {
    // S5 and A1 were underway when the rating was agreed: their live cards,
    // Season's End and edition rebuilds keep the rating they were printed with.
    for (const season of ["S1", "S2", "S3", "S4", "S5", "A1"]) {
      expect(ratesByPlaystyle(season), season).toBe(false);
      expect(styleYardstickFor(season, FILE), season).toBeNull();
    }
    expect([...LEGACY_RATING_SEASONS]).toEqual(["S1", "S2", "S3", "S4", "S5", "A1"]);
  });

  it("starts with S6 and A2, however the code is spelled", () => {
    expect(ratesByPlaystyle("S6")).toBe(true);
    expect(ratesByPlaystyle("A2")).toBe(true);
    expect(ratesByPlaystyle(" s5 ")).toBe(false);
    expect(ratesByPlaystyle(" s6 ")).toBe(true);
  });

  it("rates a missing season the old way rather than guessing", () => {
    expect(ratesByPlaystyle("")).toBe(false);
    expect(ratesByPlaystyle(null)).toBe(false);
    expect(styleYardstickFor(undefined, FILE)).toBeNull();
  });
});

describe("styleYardstickFor", () => {
  it("returns the season's own yardstick", () => {
    expect(styleYardstickFor("S6", FILE)).toBe(FILE.seasons.S6);
    expect(styleYardstickFor("a2", FILE)).toBe(FILE.seasons.A2);
  });

  it("falls back to the league's newest yardstick when rollover skipped the generator", () => {
    // Graded against slightly older history is still graded by the agreed
    // rule; quietly reverting a new season to the old rating would not be.
    expect(styleYardstickFor("S7", FILE)).toBe(FILE.seasons.S6);
    expect(styleYardstickFor("A3", FILE)).toBe(FILE.seasons.A2);
  });
});

describe("the generated yardstick file", () => {
  const file = generated as unknown as StyleYardstickFile;

  it("has a yardstick for each league's first style-rated season", () => {
    expect(file.seasons.S6?.league).toBe("premier");
    expect(file.seasons.A2?.league).toBe("academy");
  });

  it("grades no season against itself or a later season", () => {
    for (const [season, yardstick] of Object.entries(file.seasons)) {
      expect(yardstick.history, season).not.toContain(season);
    }
  });

  it("holds well-formed distributions and a usable curve", () => {
    for (const [season, yardstick] of Object.entries(file.seasons)) {
      expect(Number.isFinite(yardstick.curve.base) && Number.isFinite(yardstick.curve.scale), season).toBe(true);
      expect(yardstick.curve.scale, season).toBeGreaterThan(0);
      for (const [key, group] of Object.entries(yardstick.distributions)) {
        for (const [stat, quantiles] of Object.entries(group.stats)) {
          expect(quantiles, `${season} ${key} ${stat}`).toHaveLength(21);
          expect([...quantiles!].sort((a, b) => a - b), `${season} ${key} ${stat}`).toEqual(quantiles);
        }
      }
    }
  });
});
