import { describe, expect, it } from "vitest";
import { academyTeamNames, filterTeamsByNames, normalizeTeamName, resolveLeagueView } from "./context";

describe("league context helpers", () => {
  it("normalizes team names for cross-table matching", () => {
    expect(normalizeTeamName("  Academy Wolves  ")).toBe("academy wolves");
  });

  it("builds an Academy team-name set", () => {
    expect(academyTeamNames([{ name: " A " }, { name: "B" }])).toEqual(new Set(["a", "b"]));
  });

  it("resolves Premier by default and Academy when requested", () => {
    expect(resolveLeagueView(undefined)).toBe("premier");
    expect(resolveLeagueView("academy")).toBe("academy");
    expect(resolveLeagueView("other")).toBe("premier");
  });

  it("filters Premier and Academy team rows to a selected name set", () => {
    expect(filterTeamsByNames([{ name: "Premier" }, { name: "Academy" }], new Set(["premier"]))).toEqual([
      { name: "Premier" },
    ]);
  });
});
