import { describe, expect, it } from "vitest";
import { aggregateInhouseChampionStats } from "./inhouse";

describe("aggregateInhouseChampionStats", () => {
  it("groups a player's in-house games by champion", () => {
    const result = aggregateInhouseChampionStats([
      { champion: "Ahri", kills: 8, deaths: 2, assists: 6, win: true },
      { champion: "Ahri", kills: 2, deaths: 4, assists: 3, win: false },
      { champion: "Orianna", kills: 5, deaths: 1, assists: 7, win: true },
      { champion: null, kills: 99, deaths: 0, assists: 0, win: true },
    ]);

    expect(result).toEqual([
      {
        champion: "Ahri",
        games: 2,
        wins: 1,
        winrate_pct: 50,
        avg_kda: 3.17,
      },
      {
        champion: "Orianna",
        games: 1,
        wins: 1,
        winrate_pct: 100,
        avg_kda: 12,
      },
    ]);
  });

  it("sorts champions by games, then win rate, then name", () => {
    const result = aggregateInhouseChampionStats([
      { champion: "Zed", kills: 1, deaths: 1, assists: 1, win: true },
      { champion: "Ahri", kills: 1, deaths: 1, assists: 1, win: false },
      { champion: "Ahri", kills: 1, deaths: 1, assists: 1, win: true },
      { champion: "Zed", kills: 1, deaths: 1, assists: 1, win: false },
    ]);

    expect(result.map((row) => row.champion)).toEqual(["Ahri", "Zed"]);
  });
});
