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

  it("matches a uniquely named roster player when no Riot account metadata is available", () => {
    const result = buildIngestedScoutingGames(
      [{ id: "p1", displayName: "Ciivil", role: "top" }],
      [{ summoner_name: "Ciivil", tag: "NA1", champion: "Kennen", season: "S5", match_id: "m1", game_date: null }],
    );

    expect(result).toEqual([expect.objectContaining({ playerId: "p1", champion: "Kennen" })]);
  });

  it("accepts harmless Riot game-name spacing differences when the known tag matches", () => {
    const result = buildIngestedScoutingGames(
      [
        { id: "joey", displayName: "Sir Joey", role: "jungle" },
        { id: "mitsu", displayName: "08 Mitsu Eclipse", role: "support" },
      ],
      [
        { summoner_name: "Sir Joey", tag: "Valor", champion: "Xin Zhao", season: "S5", match_id: "m1", game_date: null },
        { summoner_name: "08 Mitsu Eclipse", tag: "Chime", champion: "Rakan", season: "S5", match_id: "m2", game_date: null },
      ],
    );

    expect(result.map((game) => game.playerId)).toEqual(["joey", "mitsu"]);
  });

  it("does not combine a display name with a tag belonging to another linked account", () => {
    const result = buildIngestedScoutingGames(
      [{ id: "meta", displayName: "MetaShift", role: "jungle" }],
      [{ summoner_name: "MetaShift", tag: "PAWG", champion: "Vi", season: "S5", match_id: "m1", game_date: null }],
    );

    expect(result).toEqual([]);
  });

  it("keeps both weeks while preserving a substitute's lower game count", () => {
    const result = buildIngestedScoutingGames(
      [
        { id: "starter", displayName: "Canny", role: "top" },
        { id: "sub", displayName: "New Sub", role: "top" },
      ],
      [
        { summoner_name: "Canny", tag: "rip", champion: "Ornn", season: "S5", match_id: "w1-g1", game_date: "2026-08-17" },
        { summoner_name: "Canny", tag: "rip", champion: "Sion", season: "S5", match_id: "w1-g2", game_date: "2026-08-17" },
        { summoner_name: "Canny", tag: "rip", champion: "Kennen", season: "S5", match_id: "w2-g1", game_date: "2026-08-24" },
        { summoner_name: "New Sub", tag: "NA1", champion: "Gnar", season: "S5", match_id: "w2-g1", game_date: "2026-08-24" },
      ],
    );

    expect(result.filter((game) => game.playerId === "starter")).toHaveLength(3);
    expect(result.filter((game) => game.playerId === "sub")).toHaveLength(1);
    expect(new Set(result.map((game) => game.gameDate))).toEqual(new Set(["2026-08-17", "2026-08-24"]));
  });

  it("preserves exact game and side evidence for roster-match attribution", () => {
    const result = buildIngestedScoutingGames(
      [{ id: "p1", displayName: "Starter", role: "mid" }],
      [{ summoner_name: "Starter", tag: "NA1", champion: "Ahri", season: "S5", match_id: "match-1", game_date: null, team_side: "Blue" }],
      new Map([["match-1", { fixtureId: "fixture-1", gameNumber: 2 }]]),
    );

    expect(result[0]).toMatchObject({ fixtureId: "fixture-1", gameNumber: 2, teamSide: "blue" });
  });
});
