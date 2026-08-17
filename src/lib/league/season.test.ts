import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMY_SEASON, fetchLeagueSeasons, seasonForLeague } from "./season";

function client(data: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data }) }) }),
    }),
  } as never;
}

describe("seasonForLeague", () => {
  it("picks the league's own code", () => {
    const seasons = { premier: "S5", academy: "A1" };
    expect(seasonForLeague(seasons, "premier")).toBe("S5");
    expect(seasonForLeague(seasons, "academy")).toBe("A1");
  });
});

describe("fetchLeagueSeasons", () => {
  it("reads both codes from league_settings", async () => {
    await expect(fetchLeagueSeasons(client({ current_season: "S5", academy_season: "A2" }))).resolves.toEqual({
      premier: "S5",
      academy: "A2",
    });
  });

  it("falls back to the default Academy code when the column is unset", async () => {
    await expect(fetchLeagueSeasons(client({ current_season: "S5" }))).resolves.toEqual({
      premier: "S5",
      academy: DEFAULT_ACADEMY_SEASON,
    });
  });

  it("degrades to empty Premier rather than throwing when there is no settings row", async () => {
    await expect(fetchLeagueSeasons(client(null))).resolves.toEqual({
      premier: "",
      academy: DEFAULT_ACADEMY_SEASON,
    });
  });
});
