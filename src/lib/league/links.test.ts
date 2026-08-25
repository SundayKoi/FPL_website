import { describe, expect, it } from "vitest";
import { leaguePageLinks, leaguePath, pairedLeagueHref, resolveLeagueFromPath } from "./links";

describe("league page links", () => {
  it("returns paired Premier and Academy links", () => {
    expect(leaguePageLinks("stats", "academy", { tab: "Teams", season: "S5" })).toEqual({
      premier: "/stats?tab=Teams&season=S5",
      academy: "/academy/stats?tab=Teams&season=S5",
    });
  });

  it("maps My Team to the canonical paired routes", () => {
    expect(leaguePath("my-team", "premier")).toBe("/my-team");
    expect(leaguePath("my-team", "academy")).toBe("/academy/my-team");
  });

  it("keeps the canonical Scouting route and selected admin team", () => {
    expect(leaguePageLinks("scouting", "academy", { team: "team-2" })).toEqual({
      premier: "/my-team/scouting?team=team-2",
      academy: "/academy/my-team/scouting?team=team-2",
    });
  });

  it("resolves league views from roots and nested league routes", () => {
    expect(resolveLeagueFromPath("/")).toBe("premier");
    expect(resolveLeagueFromPath("/academy")).toBe("academy");
    expect(resolveLeagueFromPath("/academy/stats")).toBe("academy");
    expect(resolveLeagueFromPath("/academy/teams/team-1/players/player-1")).toBe("academy");
    expect(resolveLeagueFromPath("/my-team/scouting")).toBe("premier");
    expect(resolveLeagueFromPath("/betting")).toBe("premier");
  });

  it("pairs canonical paths while preserving query strings", () => {
    expect(pairedLeagueHref("/stats", "academy", "tab=Teams&season=S5")).toBe(
      "/academy/stats?tab=Teams&season=S5",
    );
    expect(pairedLeagueHref("/academy/my-team/scouting", "premier")).toBe("/my-team/scouting");
    expect(pairedLeagueHref("/betting", "academy")).toBe("/academy");
    expect(pairedLeagueHref("/academy/unknown", "premier")).toBe("/");
    expect(pairedLeagueHref("/stats", "premier")).toBe("/stats");
  });
});
