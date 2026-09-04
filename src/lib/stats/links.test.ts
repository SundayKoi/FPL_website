import { describe, expect, it } from "vitest";
import { teamStatsHref } from "./links";

describe("teamStatsHref", () => {
  it("builds stable Premier and Academy team detail URLs", () => {
    expect(teamStatsHref({
      league: "premier",
      teamName: " A & B ",
      season: "S5",
      phase: "Regular",
    })).toBe("/stats?tab=Teams&team=A+%26+B&season=S5&phase=Regular");
    expect(teamStatsHref({
      league: "academy",
      teamName: "Academy One",
      season: "A1",
      phase: "Playoffs",
    })).toBe("/academy/stats?tab=Teams&team=Academy+One&season=A1&phase=Playoffs");
  });

  it("omits blank seasons and the default All phase", () => {
    expect(teamStatsHref({ league: "premier", teamName: "Team", season: "", phase: "All" }))
      .toBe("/stats?tab=Teams&team=Team");
    expect(teamStatsHref({ league: "academy", teamName: "Team" }))
      .toBe("/academy/stats?tab=Teams&team=Team");
  });
});
