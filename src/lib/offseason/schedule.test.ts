import { describe, expect, it } from "vitest";
import { assignSides, eliminationPairings, matchRounds, roundRobinPairings, tierSchedule, type Pairing } from "./schedule";

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

describe("assignSides", () => {
  it("swaps a pair onto the other sides on a coin flip", () => {
    const flips = [0.2, 0.8];
    const sided = assignSides(
      [
        { teamA: "T1", teamB: "T2", round: 1 },
        { teamA: "T3", teamB: "T4", round: 1 },
      ],
      () => flips.shift()!,
    );
    expect(sided.map(({ teamA, teamB }) => `${teamA}-${teamB}`)).toEqual(["T2-T1", "T3-T4"]);
  });
});

describe("tierSchedule", () => {
  it("gives the main tier a Bo1 round robin", () => {
    const schedule = tierSchedule({ tier: "main", teamIds: teams(8), weekNumber: 1, hasEliminationTier: false })!;
    expect(schedule.stage).toBe("round_robin");
    expect(schedule.bestOf).toBe(1);
    expect([...gamesPerTeam(schedule.pairings).values()].every((games) => games === 3)).toBe(true);
  });

  it("gives the elimination tier Bo5 pairings, first against second", () => {
    const schedule = tierSchedule({ tier: "elimination", teamIds: teams(4), weekNumber: 3, hasEliminationTier: true })!;
    expect(schedule).toMatchObject({ stage: "elimination", bestOf: 5 });
    expect(schedule.pairings.map(({ teamA, teamB }) => `${teamA}-${teamB}`)).toEqual(["T1-T2", "T3-T4"]);
  });

  it("makes the last two teams a Bo5 final once eliminations have started", () => {
    expect(tierSchedule({ tier: "main", teamIds: teams(2), weekNumber: 6, hasEliminationTier: false })).toMatchObject({
      stage: "final",
      bestOf: 5,
      pairings: [{ teamA: "T1", teamB: "T2" }],
    });
    // Two main teams beside an elimination tier, or before week 3, are a round robin.
    expect(tierSchedule({ tier: "main", teamIds: teams(2), weekNumber: 4, hasEliminationTier: true })!.stage).toBe("round_robin");
    expect(tierSchedule({ tier: "main", teamIds: teams(2), weekNumber: 2, hasEliminationTier: false })!.stage).toBe("round_robin");
  });

  it("schedules nothing for fewer than two teams", () => {
    expect(tierSchedule({ tier: "main", teamIds: ["T1"], weekNumber: 1, hasEliminationTier: false })).toBeNull();
  });
});

describe("matchRounds", () => {
  const match = (a: string, b: string) => ({ team_a_id: a, team_b_id: b });

  it("groups an eight-team round robin into games of four", () => {
    const teams = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const matches = roundRobinPairings(teams).map((pairing) => match(pairing.teamA, pairing.teamB));
    const rounds = matchRounds(matches);
    expect(rounds.map((round) => round.length)).toEqual([4, 4, 4]);
    for (const round of rounds) {
      expect(new Set(round.flatMap((m) => [m.team_a_id, m.team_b_id])).size).toBe(8);
    }
  });

  it("starts a new game as soon as a team would play twice", () => {
    expect(matchRounds([match("a", "b"), match("c", "d"), match("b", "c"), match("a", "d")])).toEqual([
      [match("a", "b"), match("c", "d")],
      [match("b", "c"), match("a", "d")],
    ]);
    expect(matchRounds([match("a", "b"), match("a", "c")])).toHaveLength(2);
    expect(matchRounds([])).toEqual([]);
  });
});
