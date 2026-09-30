import { describe, expect, it } from "vitest";
import { eliminationPairings, roundRobinPairings, type Pairing } from "./schedule";

const teams = (count: number) => Array.from({ length: count }, (_, i) => `T${i + 1}`);

function gamesPerTeam(pairings: Pairing[]): Map<string, number> {
  const games = new Map<string, number>();
  for (const { teamA, teamB } of pairings) {
    games.set(teamA, (games.get(teamA) ?? 0) + 1);
    games.set(teamB, (games.get(teamB) ?? 0) + 1);
  }
  return games;
}

function expectNoRematch(pairings: Pairing[]) {
  const keys = pairings.map(({ teamA, teamB }) => [teamA, teamB].sort().join("|"));
  expect(new Set(keys).size).toBe(keys.length);
}

describe("roundRobinPairings", () => {
  it("returns nothing for fewer than two teams", () => {
    expect(roundRobinPairings([])).toEqual([]);
    expect(roundRobinPairings(["T1"])).toEqual([]);
  });

  it("plays a full round robin when it fits under the cap", () => {
    const pairings = roundRobinPairings(teams(4));
    expect(pairings).toHaveLength(6);
    expectNoRematch(pairings);
    expect([...gamesPerTeam(pairings).values()]).toEqual([3, 3, 3, 3]);
  });

  it("caps each team at three games in a larger week", () => {
    const pairings = roundRobinPairings(teams(6));
    expect(pairings).toHaveLength(9);
    expectNoRematch(pairings);
    expect([...gamesPerTeam(pairings).values()].every((games) => games === 3)).toBe(true);
  });

  it("tops up an odd week so at most one team is a game short", () => {
    for (const count of [5, 7, 9]) {
      const pairings = roundRobinPairings(teams(count));
      expectNoRematch(pairings);
      const games = [...gamesPerTeam(pairings).values()];
      expect(games).toHaveLength(count);
      expect(games.every((played) => played <= 3)).toBe(true);
      expect(games.filter((played) => played < 3)).toHaveLength(1);
    }
  });

  it("gives three teams a full round robin", () => {
    const pairings = roundRobinPairings(teams(3));
    expect(pairings).toHaveLength(3);
    expect([...gamesPerTeam(pairings).values()]).toEqual([2, 2, 2]);
  });

  it("numbers rounds from one", () => {
    const pairings = roundRobinPairings(teams(4));
    expect(pairings.map((pairing) => pairing.round)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("eliminationPairings", () => {
  it("pairs an even tier off", () => {
    expect(eliminationPairings(teams(4))).toEqual([
      { teamA: "T1", teamB: "T2", round: 1 },
      { teamA: "T3", teamB: "T4", round: 1 },
    ]);
  });

  it("plays an odd tier as a full round robin", () => {
    const pairings = eliminationPairings(teams(3));
    expect(pairings).toHaveLength(3);
    expectNoRematch(pairings);
  });

  it("returns nothing for a single team", () => {
    expect(eliminationPairings(["T1"])).toEqual([]);
  });
});
