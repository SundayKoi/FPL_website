import { describe, expect, it } from "vitest";
import type { TeamAggRow } from "./types";
import { mergeTeamRowsForScope, resolveTeamParam } from "./teamProfile";

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

describe("team profile scope", () => {
  it("resolves exact normalized team names and rejects fuzzy or ambiguous matches", () => {
    expect(resolveTeamParam([row()], " meridian ")).toBe("Meridian");
    expect(resolveTeamParam([row()], "Merid")).toBeNull();
    expect(resolveTeamParam([row({ team_name: "A Team" }), row({ team_name: " a team " })], "A TEAM")).toBeNull();
  });

  it("merges only rows in scope with games-weighted aggregates", () => {
    const regular = row({ games: 2, wins: 2, losses: 0, winrate_pct: 100, avg_duration_min: 20 });
    const playoffs = row({ games: 6, wins: 3, losses: 3, winrate_pct: 50, avg_duration_min: 30, season_phase: "Playoffs" });
    const otherSeason = row({ season: "S4", games: 1, wins: 0, losses: 1 });

    const merged = mergeTeamRowsForScope([regular, playoffs, otherSeason], "S5", "All");

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      season: "S5",
      games: 8,
      wins: 5,
      losses: 3,
      winrate_pct: 62.5,
      avg_duration_min: 27.5,
    });
  });

  it("excludes other seasons and phases unless the requested scope includes them", () => {
    const s4 = row({ season: "S4" });
    const s5Regular = row();
    const s5Playoffs = row({ season_phase: "Playoffs" });

    expect(mergeTeamRowsForScope([s4, s5Regular, s5Playoffs], "S5", "Regular")).toEqual([s5Regular]);
    expect(mergeTeamRowsForScope([s4, s5Regular], "All", "Regular")[0]).toMatchObject({
      season: "All",
      games: 8,
    });
  });
});
