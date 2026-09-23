import { describe, expect, it } from "vitest";
import {
  buildCodeImportPreview,
  buildPostseasonCodePreview,
  parseTournamentCodes,
  type PostseasonExistingCodeSnapshot,
} from "./codeImport";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "week_1",
    division: null,
    team_a: "Team A",
    team_b: "Team B",
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-16T00:00:00Z",
    ...overrides,
  };
}

describe("parseTournamentCodes", () => {
  it("splits codes across commas, newlines, quotes, and whitespace", () => {
    expect(parseTournamentCodes('"NA1",\n "NA2", "NA3"')).toEqual(["NA1", "NA2", "NA3"]);
    expect(parseTournamentCodes("NA1\n\n NA2, , NA3")).toEqual(["NA1", "NA2", "NA3"]);
  });

  it("throws when no codes are found", () => {
    expect(() => parseTournamentCodes(" , \n ")).toThrow("No tournament codes found");
  });
});

describe("buildCodeImportPreview", () => {
  it("groups codes into triplets in fixture order and ignores played fixtures", () => {
    const fixtures = [
      fixture({ id: "played", stage: "week_1", score_a: 1, score_b: 0, sort_order: 0 }),
      fixture({ id: "week-2", stage: "week_2", sort_order: 3, team_a: "Week 2 A", team_b: "Week 2 B" }),
      fixture({ id: "week-1", stage: "week_1", sort_order: 9, team_a: "Week 1 A", team_b: "Week 1 B" }),
      fixture({ id: "quarterfinals", stage: "quarterfinals", sort_order: 0, team_a: "Q A", team_b: "Q B" }),
    ];

    const preview = buildCodeImportPreview(fixtures, ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "EXTRA"]);

    expect(preview.requiredCodeCount).toBe(9);
    expect(preview.unusedCount).toBe(1);
    expect(preview.fixtures).toEqual([
      {
        fixtureId: "week-1",
        stage: "week_1",
        teamA: "Week 1 A",
        teamB: "Week 1 B",
        codes: ["A1", "A2", "A3"],
      },
      {
        fixtureId: "week-2",
        stage: "week_2",
        teamA: "Week 2 A",
        teamB: "Week 2 B",
        codes: ["B1", "B2", "B3"],
      },
      {
        fixtureId: "quarterfinals",
        stage: "quarterfinals",
        teamA: "Q A",
        teamB: "Q B",
        codes: ["C1", "C2", "C3"],
      },
    ]);
  });

  it("throws when there are fewer than three codes per target fixture", () => {
    const fixtures = [fixture({ id: "week-1", stage: "week_1" })];

    try {
      buildCodeImportPreview(fixtures, ["A1", "A2"]);
      throw new Error("Expected buildCodeImportPreview to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Need at least 3 tournament codes for 1 target fixture.");
    }
  });

  it("orders postseason fixtures by the explicit stage sequence before sort order", () => {
    const fixtures = [
      fixture({ id: "semifinal", stage: "semifinals", sort_order: 0 }),
      fixture({ id: "quarterfinal", stage: "quarterfinals", sort_order: 1 }),
      fixture({ id: "gauntlet-2", stage: "gauntlet_r2", sort_order: 2 }),
      fixture({ id: "gauntlet-1", stage: "gauntlet_r1", sort_order: 3 }),
    ];

    const preview = buildCodeImportPreview(fixtures, [
      "G1-1", "G1-2", "G1-3",
      "G2-1", "G2-2", "G2-3",
      "QF-1", "QF-2", "QF-3",
      "SF-1", "SF-2", "SF-3",
    ]);

    expect(preview.fixtures.map(({ fixtureId, codes }) => ({ fixtureId, codes }))).toEqual([
      { fixtureId: "gauntlet-1", codes: ["G1-1", "G1-2", "G1-3"] },
      { fixtureId: "gauntlet-2", codes: ["G2-1", "G2-2", "G2-3"] },
      { fixtureId: "quarterfinal", codes: ["QF-1", "QF-2", "QF-3"] },
      { fixtureId: "semifinal", codes: ["SF-1", "SF-2", "SF-3"] },
    ]);
  });
});

describe("buildPostseasonCodePreview", () => {
  const teams: LeagueTeam[] = [
    { id: "team-a", name: "Team A", abbreviation: "A", active: true },
    { id: "team-b", name: "Team B", abbreviation: "B", active: true },
    { id: "team-c", name: "Team C", abbreviation: "C", active: true },
    { id: "team-d", name: "Team D", abbreviation: "D", active: true },
  ];

  const existing: PostseasonExistingCodeSnapshot[] = [
    { id: "code-g2-1", fixtureId: "gauntlet-2", gameNumber: 1, code: "KEEP-G2-1" },
    { id: "code-qf-1", fixtureId: "quarterfinals", gameNumber: 1, code: "KEEP-QF-1" },
    { id: "code-qf-3", fixtureId: "quarterfinals", gameNumber: 3, code: "KEEP-QF-3" },
  ];

  it("allocates Bo1/Bo3/Bo5 missing slots in bracket order and reports skips/unused input", () => {
    const fixtures = [
      fixture({ id: "finals", stage: "finals", sort_order: 0, team_a: null, team_b: "Team D", best_of: 5 }),
      fixture({ id: "semifinals", stage: "semifinals", sort_order: 0, team_a: "Team A", team_b: "Team B", best_of: 5, score_a: 3, score_b: 1 }),
      fixture({ id: "quarterfinals", stage: "quarterfinals", sort_order: 9, team_a: "Team A", team_b: "Team C", best_of: 5 }),
      fixture({ id: "gauntlet-2", stage: "gauntlet_r2", sort_order: 2, team_a: "Team C", team_b: "Team D", best_of: 3 }),
      fixture({ id: "gauntlet-1", stage: "gauntlet_r1", sort_order: 3, team_a: "Team A", team_b: "Team D", best_of: 1 }),
    ];

    const preview = buildPostseasonCodePreview(
      fixtures,
      existing,
      ["G1", "G2-2", "G2-3", "QF-2", "QF-4", "QF-5", "EXTRA"],
      "all-postseason",
      teams,
    );

    expect(preview.requiredCodeCount).toBe(6);
    expect(preview.unusedCount).toBe(1);
    expect(preview.existingCodeCount).toBe(3);
    expect(preview.fixtures.map((row) => ({ id: row.fixtureId, bestOf: row.bestOf, missing: row.missingGameNumbers }))).toEqual([
      { id: "gauntlet-1", bestOf: 1, missing: [1] },
      { id: "gauntlet-2", bestOf: 3, missing: [2, 3] },
      { id: "quarterfinals", bestOf: 5, missing: [2, 4, 5] },
    ]);
    expect(preview.assignments).toEqual([
      { fixtureId: "gauntlet-1", gameNumber: 1, code: "G1" },
      { fixtureId: "gauntlet-2", gameNumber: 2, code: "G2-2" },
      { fixtureId: "gauntlet-2", gameNumber: 3, code: "G2-3" },
      { fixtureId: "quarterfinals", gameNumber: 2, code: "QF-2" },
      { fixtureId: "quarterfinals", gameNumber: 4, code: "QF-4" },
      { fixtureId: "quarterfinals", gameNumber: 5, code: "QF-5" },
    ]);
    expect(preview.skippedFixtures.map(({ fixtureId, reason }) => ({ fixtureId, reason }))).toEqual([
      { fixtureId: "semifinals", reason: "scored" },
      { fixtureId: "finals", reason: "tbd-opponent" },
    ]);
  });

  it("restricts the selected scope and preserves a complete fixture", () => {
    const complete = fixture({ id: "gauntlet-1", stage: "gauntlet_r1", team_a: "Team A", team_b: "Team B", best_of: 1 });
    const playoff = fixture({ id: "quarterfinals", stage: "quarterfinals", team_a: "Team C", team_b: "Team D", best_of: 5 });
    const completeCode = { id: "complete-code", fixtureId: complete.id, gameNumber: 1, code: "ALREADY-ISSUED" };
    const preview = buildPostseasonCodePreview([complete, playoff], [completeCode], ["Q1", "Q2", "Q3", "Q4", "Q5"], "gauntlet", teams);

    expect(preview.requiredCodeCount).toBe(0);
    expect(preview.unusedCount).toBe(5);
    expect(preview.skippedFixtures).toEqual([{ ...complete, fixtureId: complete.id, teamA: complete.team_a, teamB: complete.team_b, bestOf: complete.best_of, reason: "complete" }]);
    expect(preview.fixtures).toEqual([]);
  });

  it("reclaims an assigned unused code and fills the slot it vacates", () => {
    const open = fixture({ id: "gauntlet-bo3", stage: "gauntlet_r1", team_a: "Team A", team_b: "Team B", best_of: 3 });
    const assigned = { id: "old-game-3", fixtureId: open.id, gameNumber: 3, code: "RECLAIM-ME" };

    const preview = buildPostseasonCodePreview(
      [open],
      [assigned],
      ["RECLAIM-ME", "NEW-GAME-2", "NEW-GAME-3"],
      "gauntlet",
      teams,
    );

    expect(preview.requiredCodeCount).toBe(3);
    expect(preview.reusedAssignmentCount).toBe(1);
    expect(preview.fixtures[0].existing).toEqual([]);
    expect(preview.assignments).toEqual([
      { fixtureId: open.id, gameNumber: 1, code: "RECLAIM-ME" },
      { fixtureId: open.id, gameNumber: 2, code: "NEW-GAME-2" },
      { fixtureId: open.id, gameNumber: 3, code: "NEW-GAME-3" },
    ]);
    expect(preview.existingCodeSnapshot).toEqual([assigned]);
  });

  it("rejects duplicate input and ambiguous names while previewing assigned code reuse", () => {
    const open = fixture({ id: "gauntlet-1", stage: "gauntlet_r1", team_a: "Team A", team_b: "Team B", best_of: 1 });

    expect(() => buildPostseasonCodePreview([open], [], ["DUP", "DUP"], "gauntlet", teams)).toThrow("Duplicate tournament code");
    const reassigned = buildPostseasonCodePreview(
      [open],
      [{ id: "old", fixtureId: "other", gameNumber: 1, code: "UNUSED-ASSIGNMENT" }],
      ["UNUSED-ASSIGNMENT"],
      "gauntlet",
      teams,
    );
    expect(reassigned.assignments).toEqual([{ fixtureId: open.id, gameNumber: 1, code: "UNUSED-ASSIGNMENT" }]);
    expect(reassigned.reusedAssignmentCount).toBe(1);
    expect(() => buildPostseasonCodePreview([open], [], ["NEW"], "gauntlet", [
      ...teams,
      { id: "team-a-duplicate", name: " team a ", abbreviation: "A2", active: true },
    ])).toThrow("unambiguous");
  });
});
