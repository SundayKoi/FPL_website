import { describe, expect, it } from "vitest";
import {
  BEST_OF_MIN_CHAMPION_GAMES,
  BEST_OF_MIN_PLAYER_GAMES,
  canonicalChampion,
  compareBestOfCandidates,
  selectBestOf,
  type BestOfAppearance,
} from "./best-of";

function record(playerKey: string, champion: string, wins: number, games: number, performance = 50, seasonGames = games): BestOfAppearance[] {
  const candidateRows = Array.from({ length: games }, (_, index) => ({
    playerKey,
    playerName: `${playerKey}#NA1`,
    team: "Wolves",
    champion,
    win: index < wins,
    performance,
  }));
  const fillerRows = Array.from({ length: Math.max(0, seasonGames - games) }, (_, index) => ({
    playerKey,
    playerName: `${playerKey}#NA1`,
    team: "Wolves",
    champion: `Filler ${champion} ${index}`,
    win: false,
    performance,
  }));
  return [...candidateRows, ...fillerRows];
}

const winnerKeys = (selection: ReturnType<typeof selectBestOf>) =>
  selection.presentation.map((candidate) => `${candidate.playerKey}:${candidate.championId}`);

describe("Best of results selector", () => {
  it("centralizes the five-overall and three-champion evidence thresholds", () => {
    expect(BEST_OF_MIN_PLAYER_GAMES).toBe(5);
    expect(BEST_OF_MIN_CHAMPION_GAMES).toBe(3);

    const fourOverall = selectBestOf(record("alice", "Ahri", 3, 4));
    expect(fourOverall.selected).toHaveLength(0);
    expect(fourOverall.diagnostics.playersWithoutCard[0].reason).toBe("player-threshold");

    const twoChampion = selectBestOf([
      ...record("alice", "Ahri", 2, 2),
      ...record("alice", "Azir", 1, 1),
      ...record("alice", "Lux", 1, 1),
      ...record("alice", "Garen", 0, 1),
    ]);
    expect(twoChampion.selected).toHaveLength(0);
    expect(twoChampion.diagnostics.playersWithoutCard[0].reason).toBe("champion-threshold");
    expect(twoChampion.diagnostics.championsBelowThreshold).toHaveLength(4);

    const threeChampion = selectBestOf([
      ...record("alice", "Ahri", 2, 3),
      ...record("alice", "Azir", 1, 2),
    ]);
    expect(threeChampion.selected).toHaveLength(1);
    expect(threeChampion.selected[0].champion).toBe("Ahri");
  });

  it("ranks wins before win rate, then win rate before mean performance", () => {
    const candidates = [
      ...record("three-zero", "Ahri", 3, 3, 50, 5),
      ...record("five-two", "Azir", 5, 7, 50, 7),
      ...record("five-zero", "Braum", 5, 5, 50, 5),
      ...record("equal-record-low", "Caitlyn", 4, 6, 40, 6),
      ...record("equal-record-high", "Darius", 4, 6, 60, 6),
    ];
    const selection = selectBestOf(candidates);

    expect(selection.candidates.map((candidate) => candidate.playerKey)).toEqual([
      "five-zero", "five-two", "equal-record-high", "equal-record-low", "three-zero",
    ]);
    expect(selectBestOf(record("uncontested", "Garen", 0, 3, 20, 5)).selected[0]).toMatchObject({ wins: 0, championGames: 3 });
  });

  it("uses unrounded mean performance when displayed performance would tie", () => {
    const left = {
      playerKey: "left",
      playerName: "left#NA1",
      team: "Wolves",
      championId: "Ahri",
      champion: "Ahri",
      seasonGames: 5,
      championGames: 5,
      wins: 3,
      meanPerformance: 70.49,
    };
    const right = { ...left, playerKey: "right", playerName: "right#NA1", meanPerformance: 70.51 };
    expect(compareBestOfCandidates(left, right)).toBeGreaterThan(0);
    expect(compareBestOfCandidates(right, left)).toBeLessThan(0);
  });

  it("walks strongest results once and explains a cap-related promotion", () => {
    const selection = selectBestOf([
      ...record("alice", "Ahri", 6, 7, 90, 7),
      ...record("alice", "Lux", 4, 5, 80, 5),
      ...record("bob", "Ahri", 5, 7, 70, 7),
      ...record("cara", "Lux", 3, 4, 60, 5),
    ]);

    expect(winnerKeys(selection)).toEqual(["alice:Ahri", "cara:Lux"]);
    expect(selection.diagnostics.capPromotions).toMatchObject([{
      champion: "Lux",
      recipientName: "cara#NA1",
      unrestrictedLeaderName: "alice#NA1",
    }]);
    expect(selection.diagnostics.playersWithoutCard).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerKey: "bob", reason: "one-card-cap" }),
    ]));
  });

  it("does not reroute an earlier winner to increase coverage", () => {
    const selection = selectBestOf([
      ...record("alice", "Ahri", 6, 7, 50, 7),
      ...record("alice", "Lux", 4, 5, 50, 5),
      ...record("bob", "Ahri", 5, 7, 50, 7),
    ]);

    expect(winnerKeys(selection)).toEqual(["alice:Ahri"]);
    expect(selection.diagnostics.unawardedChampions).toEqual(expect.arrayContaining([
      expect.objectContaining({ champion: "Lux", reason: "one-card-cap" }),
    ]));
  });

  it("allows a player to receive a secondary champion after their stronger contender is claimed", () => {
    const selection = selectBestOf([
      ...record("alice", "Ahri", 6, 7, 50, 7),
      ...record("bob", "Ahri", 5, 7, 50, 7),
      ...record("bob", "Lux", 4, 5, 50, 5),
    ]);

    expect(winnerKeys(selection)).toEqual(["alice:Ahri", "bob:Lux"]);
  });

  it("is order-independent for exact ties and keeps tags identity-sensitive", () => {
    const input = [
      ...record("same#na1", "Ahri", 3, 3, 50, 5),
      ...record("same#na2", "Ahri", 3, 3, 50, 5),
      ...record("same#na1", "Azir", 3, 3, 50, 5),
      ...record("different", "Lux", 3, 3, 50, 5),
    ];
    const first = selectBestOf(input);
    const shuffled = selectBestOf([...input].reverse());
    expect(winnerKeys(first)).toEqual(winnerKeys(shuffled));
    expect(first.diagnostics.totalPlayers).toBe(3);
    expect(first.selected.map((candidate) => candidate.playerKey)).toEqual(["same#na1", "different"]);
  });

  it("canonicalizes champion aliases before applying the champion cap", () => {
    expect(canonicalChampion("MonkeyKing")).toEqual({ id: "MonkeyKing", displayName: "Wukong" });
    const selection = selectBestOf([
      ...record("alice", "MonkeyKing", 3, 3, 50, 5),
      ...record("bob", "Wukong", 3, 3, 50, 5),
    ]);
    expect(selection.selected).toHaveLength(1);
    expect(selection.selected[0].championId).toBe("MonkeyKing");
    expect(selection.diagnostics.contestedChampions[0].champion).toBe("Wukong");
  });
});
