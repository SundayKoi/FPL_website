import { describe, expect, it } from "vitest";
import { academyTeamNames, normalizeTeamName, resolveLeagueView } from "./context";

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
});
