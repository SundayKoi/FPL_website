import { describe, expect, it } from "vitest";
import { buildIngestedScoutingGames, buildInhousePlayerStats } from "./inhouse";

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

  it("also matches Riot account names listed in the player's linked accounts", () => {
    const result = buildInhousePlayerStats(
      [{ id: "p1", displayName: "MetaShift", role: "jungle" }],
      [{ summoner_name: "MeatShaft", champion: "Vi", kills: 4, deaths: 2, assists: 8, win: true }],
    );

    expect(result[0]).toMatchObject({ games: 1, champions: [{ champion: "Vi", games: 1 }] });
  });

  it("matches current roster labels to the ingested Riot names", () => {
    const result = buildInhousePlayerStats(
      [
        { id: "p1", displayName: "FeralEevee", role: "mid" },
        { id: "p2", displayName: "SlimPimpin", role: "adc" },
      ],
      [
        { summoner_name: "Feral Eevee", champion: "Ahri", kills: 5, deaths: 1, assists: 4, win: true },
        { summoner_name: "SlimPimpin77", champion: "Jinx", kills: 7, deaths: 2, assists: 6, win: true },
      ],
    );

    expect(result.map((player) => player.games)).toEqual([1, 1]);
  });

  it("keeps roster players with no matching in-house games", () => {
    const result = buildInhousePlayerStats(
      [{ id: "p1", displayName: "No Games", role: "top" }],
      [],
    );

    expect(result[0]).toMatchObject({ playerId: "p1", games: 0, champions: [] });
  });

  it("uses Riot tags when bare summoner names are ambiguous", () => {
    const result = buildIngestedScoutingGames(
      [
        { id: "p1", displayName: "Mirror", role: "mid", opggUrl: "https://op.gg/lol/summoners/na/Mirror-ONE" },
        { id: "p2", displayName: "Mirror", role: "adc", opggUrl: "https://op.gg/lol/summoners/na/Mirror-TWO" },
      ],
      [{ summoner_name: "Mirror", tag: "TWO", champion: "Jinx", season: "S5", match_id: "m1", game_date: null }],
    );

    expect(result).toEqual([expect.objectContaining({ playerId: "p2", champion: "Jinx" })]);
  });

  it("does not fall back to a bare name when a supplied Riot tag is unknown", () => {
    const result = buildIngestedScoutingGames(
      [{ id: "p1", displayName: "Solo", role: "mid", opggUrl: "https://op.gg/lol/summoners/na/Solo-ONE" }],
      [{ summoner_name: "Solo", tag: "TWO", champion: "Ahri", season: "S5", match_id: "m1", game_date: null }],
    );

    expect(result).toEqual([]);
  });
});
