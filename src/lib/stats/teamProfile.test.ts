import { describe, expect, it } from "vitest";
import type { TeamAggRow } from "./types";
import { mergeTeamRowsForScope, resolveTeamParam, teamRadarMetrics } from "./teamProfile";

function row(overrides: Partial<TeamAggRow> = {}): TeamAggRow {
  return {
    team_name: "Meridian",
    season: "S5",
    season_phase: "Regular",
    games: 4,
    wins: 3,
    losses: 1,
    winrate_pct: 75,
    avg_duration_min: 30,
    dragon_rate: 50,
    baron_rate: 25,
    first_blood_rate: 75,
    first_tower_rate: 50,
    avg_team_kills: 12,
    ...overrides,
  };
}

describe("team profile model", () => {
  it("resolves exact names after trimming and case folding, never fuzzy names", () => {
    const rows = [row(), row({ team_name: "Other Team" })];
    expect(resolveTeamParam(rows, " meridian ")).toBe("Meridian");
    expect(resolveTeamParam(rows, "Merid")).toBeNull();
    expect(resolveTeamParam([row(), row({ season_phase: "Playoffs" })], "MERIDIAN")).toBe("Meridian");
    expect(resolveTeamParam([row({ team_name: "A Team" }), row({ team_name: " a team " })], "A TEAM")).toBeNull();
  });

  it("merges phase rows with the shared games-weighted team formula", () => {
    const merged = mergeTeamRowsForScope([
      row({ games: 2, wins: 2, losses: 0, winrate_pct: 100, avg_duration_min: 20 }),
      row({ games: 6, wins: 3, losses: 3, winrate_pct: 50, avg_duration_min: 30, season_phase: "Playoffs" }),
      row({ team_name: "Other Team", games: 1, wins: 0, losses: 1 }),
    ], "S5", "All");

    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.team_name === "Meridian")).toMatchObject({
      season: "S5",
      games: 8,
      wins: 5,
      losses: 3,
      winrate_pct: 62.5,
      avg_duration_min: 27.5,
    });
  });

  it("filters season scope and merges all seasons when requested", () => {
    const rows = [row({ season: "S4" }), row({ season: "S5" })];
    expect(mergeTeamRowsForScope(rows, "S5", "Regular")).toEqual([rows[1]]);
    expect(mergeTeamRowsForScope(rows, "All", "Regular")[0]).toMatchObject({
      season: "All",
      games: 8,
    });
  });

  it("returns the five percentage metrics in radar order", () => {
    expect(teamRadarMetrics(row()).map((metric) => metric.key)).toEqual([
      "winrate_pct",
      "dragon_rate",
      "baron_rate",
      "first_blood_rate",
      "first_tower_rate",
    ]);
    expect(teamRadarMetrics(row()).map((metric) => metric.value)).toEqual([75, 50, 25, 75, 50]);
  });
});
