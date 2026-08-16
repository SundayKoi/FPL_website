import { describe, expect, it } from "vitest";
import { buildCodeImportPreview, parseTournamentCodes } from "./codeImport";
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
