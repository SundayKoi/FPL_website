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
  it("keeps five overall games while expanding beyond the original three-champion threshold", () => {
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
    expect(twoChampion.selected).toMatchObject([{ champion: "Ahri", selectionPass: "expansion" }]);
    expect(twoChampion.diagnostics.playersWithoutCard).toHaveLength(0);

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

    expect(selection.candidates.filter((candidate) => candidate.championGames >= 3).map((candidate) => candidate.playerKey)).toEqual([
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
    expect(first.selected.filter((candidate) => candidate.selectionPass === "original").map((candidate) => candidate.playerKey)).toEqual(["same#na1", "different"]);
  });

  it("canonicalizes champion aliases before applying the champion cap", () => {
    expect(canonicalChampion("MonkeyKing")).toEqual({ id: "MonkeyKing", displayName: "Wukong" });
    const selection = selectBestOf([
      ...record("alice", "MonkeyKing", 3, 3, 50, 5),
      ...record("bob", "Wukong", 3, 3, 50, 5),
    ]);
    expect(selection.selected.filter((candidate) => candidate.championId === "MonkeyKing")).toHaveLength(1);
    expect(selection.selected[0].championId).toBe("MonkeyKing");
    expect(selection.diagnostics.contestedChampions[0].champion).toBe("Wukong");
  });
  it("locks original and two-game picks before filling remaining players", () => {
    const input = [
      ...record("original", "Ahri", 1, 3),
      ...record("original", "Lux", 2, 2),
      ...record("expansion", "Ahri", 2, 2),
      ...record("expansion", "Lux", 1, 2),
      ...record("expansion", "Garen", 1, 1),
      ...record("remaining", "Lux", 2, 2),
      ...record("remaining", "Ahri", 2, 2),
      ...record("remaining", "Garen", 0, 1),
    ];
    const result = selectBestOf(input);
    // The original winner keeps Ahri despite both two-game challengers.
    // The strongest two-game Lux record wins next; no later pick reroutes it.
    expect(result.selected).toMatchObject([
      { playerKey: "original", champion: "Ahri", selectionPass: "original" },
      { playerKey: "remaining", champion: "Lux", selectionPass: "expansion" },
      { playerKey: "expansion", champion: "Garen", selectionPass: "remaining" },
    ]);
    expect(selectBestOf([...input].reverse()).selected).toEqual(result.selected);
    expect(result.diagnostics.passCounts).toEqual({ original: 1, expansion: 1, remaining: 1 });
    expect(new Set(result.selected.map(c => c.playerKey)).size).toBe(result.selected.length);
    expect(new Set(result.selected.map(c => c.championId)).size).toBe(result.selected.length);
  });

  it("leaves winless two-game records for the last pass and permits a winless fallback", () => {
    const result = selectBestOf([
      ...record("alice", "Ahri", 0, 2, 90),
      ...record("alice", "Lux", 1, 2, 10),
      ...record("alice", "Garen", 0, 1),
      ...record("bob", "Ahri", 0, 2, 80),
      ...record("bob", "Lux", 0, 2, 10),
      ...record("bob", "Garen", 0, 1),
    ]);
    expect(result.selected).toMatchObject([
      { playerKey: "alice", champion: "Lux", selectionPass: "expansion" },
      { playerKey: "bob", champion: "Ahri", selectionPass: "remaining", wins: 0 },
    ]);
  });

});
