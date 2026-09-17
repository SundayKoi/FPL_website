import { describe, expect, it } from "vitest";
import { selectPairChampion } from "./pairArt";
import type { SeasonRow } from "./derive";

function row(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    match_id: "match-1",
    summoner_name: "Jungle",
    tag: "NA1",
    season: "S5",
    season_phase: "Regular",
    team_name: "Wolves",
    team_side: "Blue",
    role: "JUNGLE",
    game_date: "2026-08-01T00:00:00Z",
    champion: "Ahri",
    win: true,
    performance: 50,
    ...overrides,
  };
}

const member = { playerKey: "jungle#na1", role: "JUNGLE" as const };

describe("selectPairChampion", () => {
  it("ranks wins, unrounded win rate, performance, and canonical aliases", () => {
    const selected = selectPairChampion([
      row({ champion: "Kaisa", win: true, performance: 70 }),
      row({ champion: "Kai'Sa", win: true, performance: 60 }),
      row({ champion: "Ahri", win: false, performance: 99 }),
      row({ champion: "Azir", win: true, performance: 90 }),
      row({ champion: "Azir", win: false, performance: 90 }),
    ], member, "Wolves");

    expect(selected).toMatchObject({ championId: "Kaisa", champion: "Kai'Sa", games: 2, wins: 2, losses: 0, winRate: 100, meanPerformance: 65 });
  });

  it("uses performance only when every candidate has coverage, then breaks exact ties by id", () => {
    const selected = selectPairChampion([
      row({ champion: "Ahri", win: true, performance: 10 }),
      row({ champion: "Ahri", win: false, performance: 10 }),
      row({ champion: "Azir", win: true, performance: 99 }),
      row({ champion: "Azir", win: false, performance: null }),
    ], member, "Wolves");

    expect(selected).toMatchObject({ championId: "Ahri", champion: "Ahri", games: 2, wins: 1, winRate: 50 });
    expect(selected).not.toHaveProperty("meanPerformance");
  });

  it("allows one recorded pick and excludes other roles, teams, and missing champion rows", () => {
    const selected = selectPairChampion([
      row({ champion: "Ahri" }),
      row({ champion: "Azir", team_name: "Bears" }),
      row({ champion: "Azir", role: "MIDDLE" }),
      row({ champion: "", win: false }),
    ], member, "Wolves");

    expect(selected).toMatchObject({ championId: "Ahri", games: 1, wins: 1 });
    expect(selectPairChampion([], { playerKey: "mid#na1", role: "MIDDLE" }, "Wolves")).toBeNull();
  });
});
