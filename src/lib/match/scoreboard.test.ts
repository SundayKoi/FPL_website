import { describe, expect, it } from "vitest";
import { buildScoreboard, seriesRecord, type RawStatRow } from "./scoreboard";

const row = (over: Partial<RawStatRow>): RawStatRow => ({
  match_id: "NA1_1", game_date: "2026-09-01T00:00:00Z", game_duration_min: 31.5,
  team_side: "Blue", team_name: "Alpha", summoner_name: "P", champion: "Ahri",
  role: "MIDDLE", kills: 1, deaths: 1, assists: 1, cs: 100, gold_earned: 1000,
  total_damage_to_champions: 5000, vision_score: 20, win: true, ...over,
});

const fullGame = (matchId: string, date: string, blueWins: boolean): RawStatRow[] => [
  ...["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"].map((r, i) =>
    row({ match_id: matchId, game_date: date, team_side: "Blue", team_name: "Alpha",
          summoner_name: `A${i}`, role: r, win: blueWins })),
  ...["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"].map((r, i) =>
    row({ match_id: matchId, game_date: date, team_side: "Red", team_name: "Bravo",
          summoner_name: `B${i}`, role: r, win: !blueWins })),
];

describe("buildScoreboard", () => {
  it("splits a game into two sides with five players each", () => {
    const [game] = buildScoreboard(fullGame("NA1_1", "2026-09-01T00:00:00Z", true));

    expect(game.sides).toHaveLength(2);
    expect(game.sides.map((s) => s.side)).toEqual(["Blue", "Red"]);
    expect(game.sides[0].players).toHaveLength(5);
    expect(game.sides[0].teamName).toBe("Alpha");
    expect(game.sides[0].won).toBe(true);
    expect(game.sides[1].won).toBe(false);
  });

  it("orders players by role, not by name", () => {
    const shuffled = [
      row({ summoner_name: "sup", role: "UTILITY" }),
      row({ summoner_name: "top", role: "TOP" }),
      row({ summoner_name: "adc", role: "BOTTOM" }),
      row({ summoner_name: "jgl", role: "JUNGLE" }),
      row({ summoner_name: "mid", role: "MIDDLE" }),
    ];
    const [game] = buildScoreboard(shuffled);

    expect(game.sides[0].players.map((p) => p.summonerName)).toEqual([
      "top", "jgl", "mid", "adc", "sup",
    ]);
  });

  it("accepts the league's own role names as well as Riot's", () => {
    const [game] = buildScoreboard([
      row({ summoner_name: "sup", role: "support" }),
      row({ summoner_name: "top", role: "top" }),
      row({ summoner_name: "adc", role: "adc" }),
    ]);

    expect(game.sides[0].players.map((p) => p.summonerName)).toEqual(["top", "adc", "sup"]);
  });

  it("totals each side's kills, gold and damage", () => {
    const [game] = buildScoreboard([
      row({ summoner_name: "a", kills: 3, gold_earned: 1000, total_damage_to_champions: 100 }),
      row({ summoner_name: "b", kills: 4, gold_earned: 2000, total_damage_to_champions: 250 }),
    ]);

    expect(game.sides[0].totals.kills).toBe(7);
    expect(game.sides[0].totals.gold).toBe(3000);
    expect(game.sides[0].totals.damage).toBe(350);
  });

  it("numbers games in the order they were played", () => {
    const games = buildScoreboard([
      ...fullGame("NA1_3", "2026-09-01T02:00:00Z", true),
      ...fullGame("NA1_1", "2026-09-01T00:00:00Z", false),
      ...fullGame("NA1_2", "2026-09-01T01:00:00Z", true),
    ]);

    expect(games.map((g) => g.matchId)).toEqual(["NA1_1", "NA1_2", "NA1_3"]);
    expect(games.map((g) => g.gameNumber)).toEqual([1, 2, 3]);
  });

  it("skips rows with no match id rather than inventing a game", () => {
    expect(buildScoreboard([row({ match_id: null })])).toEqual([]);
  });

  it("treats missing numbers as zero instead of rendering NaN", () => {
    const [game] = buildScoreboard([
      row({ kills: null, deaths: null, cs: null, gold_earned: null,
            total_damage_to_champions: null, vision_score: null }),
    ]);

    expect(game.sides[0].players[0].kills).toBe(0);
    expect(game.sides[0].totals.gold).toBe(0);
  });

  it("returns nothing for no rows, which is how an un-ingested series looks", () => {
    expect(buildScoreboard([])).toEqual([]);
  });
});

describe("seriesRecord", () => {
  it("tallies game wins by team name", () => {
    const games = buildScoreboard([
      ...fullGame("NA1_1", "2026-09-01T00:00:00Z", true),
      ...fullGame("NA1_2", "2026-09-01T01:00:00Z", false),
      ...fullGame("NA1_3", "2026-09-01T02:00:00Z", true),
    ]);

    expect(seriesRecord(games)).toEqual({ Alpha: 2, Bravo: 1 });
  });
});
