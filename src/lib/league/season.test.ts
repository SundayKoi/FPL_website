import { describe, expect, it } from "vitest";
import { DEFAULT_ACADEMY_SEASON, fetchLeagueSeasons, seasonBelongsToLeague } from "./season";

function client(data: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data }) }) }),
    }),
  } as never;
}

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

describe("seasonBelongsToLeague", () => {
  it("uses the season-code boundary shared by stats tables", () => {
    expect(seasonBelongsToLeague("A1", "academy")).toBe(true);
    expect(seasonBelongsToLeague("A2", "premier")).toBe(false);
    expect(seasonBelongsToLeague("S5", "premier")).toBe(true);
    expect(seasonBelongsToLeague(null, "academy")).toBe(false);
  });
});
