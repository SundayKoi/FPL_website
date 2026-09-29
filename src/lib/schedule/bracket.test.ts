import { describe, expect, it } from "vitest";
import { buildBracketModel } from "./bracket";
import type { FixtureRow } from "./types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "quarterfinals",
    division: null,
    team_a: "A",
    team_b: "B",
    scheduled_at: null,
    best_of: 5,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

describe("buildBracketModel", () => {
  it("retains all rounds and the Academy 2 to 2 to 1 published TBD final", () => {
    const model = buildBracketModel([
      fixture({ id: "q1", season: "A1", team_a: "Academy A", team_b: "Academy B", sort_order: 2 }),
      fixture({ id: "q2", season: "A1", team_a: "Academy C", team_b: "Academy D", sort_order: 1 }),
      fixture({ id: "s1", season: "A1", stage: "semifinals", team_a: "Academy E", team_b: "TBD" }),
      fixture({ id: "s2", season: "A1", stage: "semifinals", team_a: "Academy F", team_b: "TBD", sort_order: 1 }),
      fixture({ id: "final", season: "A1", stage: "finals", team_a: null, team_b: null }),
    ], "A1");
    expect(model.rounds.map((round) => round.matches.length)).toEqual([2, 2, 1]);
    expect(model.rounds[2].matches[0]).toMatchObject({ teamA: "TBD", teamB: "TBD", resultState: "pending" });
    expect(model.champion).toBeNull();
  });

  it("connects a decisive winner to a uniquely matching non-adjacent slot", () => {
    const model = buildBracketModel([
      fixture({ id: "q", team_a: "Team A", team_b: "Team B", score_a: 3, score_b: 1 }),
      fixture({ id: "s", stage: "semifinals", team_a: "Other", team_b: " team a " }),
      fixture({ id: "f", stage: "finals", team_a: "Team A", team_b: "Champion candidate", score_a: 3, score_b: 0 }),
    ], "S5");
    expect(model.confirmedEdges).toEqual([{ sourceFixtureId: "q", targetFixtureId: "s", targetSide: "team_b" }]);
    expect(model.champion).toBe("Team A");
    expect(model.pairingState).toBe("partial");
  });

  it("does not infer a winner from a tie, partial, invalid, or unfinished score", () => {
    const rows = [
      fixture({ id: "tie", score_a: 2, score_b: 2 }),
      fixture({ id: "partial", score_a: 3, score_b: null }),
      fixture({ id: "invalid", score_a: -1, score_b: 3 }),
      fixture({ id: "unfinished", score_a: 2, score_b: 1 }),
    ];
    const model = buildBracketModel(rows, "S5");
    expect(model.rounds[0].matches.map(({ resultState, winner }) => [resultState, winner])).toEqual([
      ["invalid", null], ["invalid", null], ["invalid", null], ["in-progress", null],
    ]);
  });

  it("leaves duplicate winner placements ambiguous and scopes rows to one season", () => {
    const model = buildBracketModel([
      fixture({ id: "q", score_a: 3, score_b: 0 }),
      fixture({ id: "s1", stage: "semifinals", team_a: "A", team_b: "X" }),
      fixture({ id: "s2", stage: "semifinals", team_a: "A", team_b: "Y", sort_order: 1 }),
      fixture({ id: "foreign", season: "S4", stage: "finals", team_a: "A", team_b: "X", score_a: 3, score_b: 1 }),
    ], "S5");
    expect(model.rounds[1].matches).toHaveLength(2);
    expect(model.rounds[2].matches).toHaveLength(0);
    expect(model.confirmedEdges).toEqual([]);
  });

  it("marks reseeded progression confirmed only when every decisive winner matches one published slot", () => {
    const model = buildBracketModel([
      fixture({ id: "q1", team_a: "A", team_b: "B", score_a: 3, score_b: 1, sort_order: 1 }),
      fixture({ id: "q2", team_a: "C", team_b: "D", score_a: 0, score_b: 3, sort_order: 2 }),
      fixture({ id: "s1", stage: "semifinals", team_a: "A", team_b: "D", score_a: 1, score_b: 3 }),
      fixture({ id: "final", stage: "finals", team_a: "D", team_b: "Another team", score_a: null, score_b: null }),
    ], "S5");
    expect(model.confirmedEdges).toHaveLength(3);
    expect(model.pairingState).toBe("confirmed");
    expect(model.champion).toBeNull();
  });

  it("reports an unpublished bracket when no fixture rows exist", () => {
    const model = buildBracketModel([], "S5");
    expect(model.pairingState).toBe("unpublished");
    expect(model.rounds.map((round) => round.matches)).toEqual([[], [], []]);
  });
});
