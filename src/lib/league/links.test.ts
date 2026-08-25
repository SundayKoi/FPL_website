import { describe, expect, it } from "vitest";
import { leaguePageLinks, leaguePath } from "./links";

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
});
