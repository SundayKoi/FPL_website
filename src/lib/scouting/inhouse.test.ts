import { describe, expect, it } from "vitest";
import { buildInhousePlayerStats } from "./inhouse";

describe("buildInhousePlayerStats", () => {
  it("correlates normalized in-house names and aggregates champion picks", () => {
    const result = buildInhousePlayerStats(
      [{ id: "p1", displayName: "Captain: Flying Squirtle", role: "mid" }],
      [
        { summoner_name: "Flyinq squirtle", champion: "Ahri", kills: 8, deaths: 2, assists: 6, win: true },
        { summoner_name: "Flying Squirtle", champion: "Ahri", kills: 2, deaths: 4, assists: 3, win: false },
        { summoner_name: "Flying Squirtle", champion: "Orianna", kills: 5, deaths: 1, assists: 7, win: true },
      ],
    );

    expect(result).toEqual([
      {
        playerId: "p1",
        playerName: "Captain: Flying Squirtle",
        role: "mid",
        games: 3,
        champions: [
          { champion: "Ahri", games: 2, wins: 1, winrate_pct: 50, avg_kda: 3.17 },
          { champion: "Orianna", games: 1, wins: 1, winrate_pct: 100, avg_kda: 12 },
        ],
      },
    ]);
  });

  it("keeps roster players with no matching in-house games", () => {
    const result = buildInhousePlayerStats(
      [{ id: "p1", displayName: "No Games", role: "top" }],
      [],
    );

    expect(result[0]).toMatchObject({ playerId: "p1", games: 0, champions: [] });
  });
});
