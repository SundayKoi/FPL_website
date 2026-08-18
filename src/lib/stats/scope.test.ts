import { describe, expect, it } from "vitest";
import { filterStatsRowsByPlayerKeys, filterTimelineRowsByTeams, scopeSeasons } from "./scope";

describe("Academy stats scope", () => {
  it("filters player aggregate rows by identities from Academy games", () => {
    expect(filterStatsRowsByPlayerKeys([
      { summoner_name: "Academy", tag: "1" },
      { summoner_name: "Premier", tag: "1" },
    ] as never, new Set(["academy#1"]))).toHaveLength(1);
  });

  it("filters timeline rows to Academy team sides", () => {
    expect(filterTimelineRowsByTeams([
      { blue_team: "Academy", red_team: "Premier" },
      { blue_team: "Premier", red_team: "Premier2" },
    ] as never, new Set(["academy"]))).toHaveLength(1);
  });
});

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
