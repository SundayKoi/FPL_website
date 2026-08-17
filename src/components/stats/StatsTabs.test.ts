import { describe, expect, it } from "vitest";
import { scopeSeasons } from "./StatsTabs";

describe("scopeSeasons", () => {
  const all = ["S5", "S4", "S3", "S2", "S1", "A1"];

  it("narrows Academy to its own season", () => {
    expect(scopeSeasons(all, ["A1"])).toEqual(["A1"]);
  });

  it("keeps the Academy season out of the Premier picker", () => {
    expect(scopeSeasons(all, undefined, ["A1"])).toEqual(["S5", "S4", "S3", "S2", "S1"]);
  });

  it("falls back to the allowed season when no games are ingested yet", () => {
    expect(scopeSeasons(["S5", "S4"], ["A1"])).toEqual(["A1"]);
  });

  it("leaves an unscoped list alone", () => {
    expect(scopeSeasons(all)).toEqual(all);
  });

  it("ignores blank exclusions rather than filtering on an empty code", () => {
    expect(scopeSeasons(all, undefined, [""])).toEqual(all);
  });
});
