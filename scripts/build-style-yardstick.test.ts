import { describe, expect, it } from "vitest";
import type { HistoryRow } from "../src/lib/cards/styleYardstickBuilder";
import type { StyleYardstickFile } from "../src/lib/cards/styleYardsticks";
import { buildYardsticks, formatYardsticks, uniqueGames } from "./build-style-yardstick";

let matches = 0;

/** One game between two mids in `season`. */
function game(season: string): HistoryRow[] {
  matches += 1;
  const row = (name: string, champion: string, team: string): HistoryRow => ({
    summoner_name: name,
    tag: "NA1",
    season,
    season_phase: "Regular",
    role: "MIDDLE",
    champion,
    win: team === "Blue",
    game_date: "2026-01-06T01:00:00Z",
    match_id: `${season}_${matches}`,
    team_name: team,
    team_side: team,
    game_duration_min: 30,
    kills: 5,
    deaths: 3,
    assists: 6,
    cs: 210,
    total_damage_to_champions: 21000,
    damage_share_pct: 24,
    time_ccing_others_s: 20,
  } as HistoryRow);
  return [row(`Zed${matches}`, "Zed", "Blue"), row(`Ori${matches}`, "Orianna", "Red")];
}

const rows = [...game("S1"), ...game("S2"), ...game("S5"), ...game("S6"), ...game("A1")];

describe("buildYardsticks", () => {
  it("grades each season against its own league's seasons before it", () => {
    const file = buildYardsticks(rows, ["S6", "A2"], null);
    expect(file.seasons.S6.history).toEqual(["S1", "S2", "S5"]);
    expect(file.seasons.S6.league).toBe("premier");
    // A1 is Academy's own history, so A2 does not borrow Premier's wholesale.
    expect(file.seasons.A2.history).toEqual(["A1"]);
    expect(file.seasons.A2.borrowed ?? []).not.toContain("all");
  });

  it("never grades a season against itself, even when its games are already in", () => {
    // A mid-season re-run sees S6's own games; they must stay out.
    expect(buildYardsticks(rows, ["S6"], null).seasons.S6.history).not.toContain("S6");
  });

  it("keeps other seasons' entries, so their editions still rebuild the same", () => {
    const existing: StyleYardstickFile = { about: "old", seasons: { S6: { league: "premier", history: ["S1"], games: 1, curve: { base: 1, scale: 1 }, distributions: {}, offsets: {} } } };
    const file = buildYardsticks(rows, ["A2"], existing);
    expect(file.seasons.S6).toBe(existing.seasons.S6);
    expect(Object.keys(file.seasons)).toEqual(["A2", "S6"]);
  });
});

describe("formatYardsticks", () => {
  it("prints each array on one line and round-trips exactly", () => {
    const file = buildYardsticks(rows, ["S6"], null);
    const text = formatYardsticks(file);
    expect(JSON.parse(text)).toEqual(file);
    expect(text).toMatch(/"history": \["S1", "S2", "S5"\]/);
  });
});

describe("uniqueGames", () => {
  it("drops a repeated player-match, the way raw_stats' unique key would", () => {
    const [first] = game("S1");
    expect(uniqueGames([first, { ...first }, { ...first, summoner_name: "Other" }])).toHaveLength(2);
  });
});
