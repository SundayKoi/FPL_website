import { describe, expect, it } from "vitest";
import { leaguePageLinks } from "./links";

describe("league page links", () => {
  it("returns paired Premier and Academy links", () => {
    expect(leaguePageLinks("stats", "academy", { tab: "Teams", season: "S5" })).toEqual({
      premier: "/stats?tab=Teams&season=S5",
      academy: "/academy/stats?tab=Teams&season=S5",
    });
  });
});
