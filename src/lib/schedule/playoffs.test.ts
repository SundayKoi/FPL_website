import { describe, expect, it } from "vitest";
import type { FixtureRow } from "./types";
import {
  buildAdvancementPreview,
  pairSemifinals,
  resolvePlayoffSeries,
  type PlayoffEntrant,
  type PlayoffReport,
} from "./playoffs";

const entrants: PlayoffEntrant[] = [
  { teamId: "s1", name: "Solari One", division: "Solari", seed: 1 },
  { teamId: "s2", name: "Solari Two", division: "Solari", seed: 2 },
  { teamId: "s3", name: "Solari Three", division: "Solari", seed: 3 },
  { teamId: "s4", name: "Solari Four", division: "Solari", seed: 4 },
  { teamId: "l1", name: "Lunari One", division: "Lunari", seed: 1 },
  { teamId: "l2", name: "Lunari Two", division: "Lunari", seed: 2 },
  { teamId: "l3", name: "Lunari Three", division: "Lunari", seed: 3 },
  { teamId: "l4", name: "Lunari Four", division: "Lunari", seed: 4 },
];

function fixture(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "qf-0",
    season: "S5",
    stage: "quarterfinals",
    division: null,
    team_a: "Solari One",
    team_b: "Lunari Four",
    scheduled_at: "2026-09-28T20:00:00-04:00",
    best_of: 5,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function report(overrides: Partial<PlayoffReport> = {}): PlayoffReport {
  return {
    id: "report-1",
    fixture_id: "qf-0",
    season: "S5",
    season_phase: "playoffs",
    team_a_id: "s1",
    team_b_id: "l4",
    score_a: 3,
    score_b: 1,
    status: "ingested",
    submitted_at: "2026-09-28T23:00:00Z",
    forfeit_team_id: null,
    games: [],
    ...overrides,
  };
}

function makeFixture(id: string, sortOrder: number, a: PlayoffEntrant, b: PlayoffEntrant, winner: PlayoffEntrant): FixtureRow {
  const aWins = winner.teamId === a.teamId;
  return fixture({
    id,
    sort_order: sortOrder,
    team_a: a.name,
    team_b: b.name,
    score_a: aWins ? 3 : 1,
    score_b: aWins ? 1 : 3,
  });
}

describe("pairSemifinals", () => {
  it("covers every quarterfinal winner combination and respects the 3/1 and 4/0 rules", () => {
    const qfs = [
      [entrants[0], entrants[7]],
      [entrants[1], entrants[6]],
      [entrants[4], entrants[3]],
      [entrants[5], entrants[2]],
    ] as const;
    for (let mask = 0; mask < 16; mask += 1) {
      const winners = qfs.map(([a, b], index) => ((mask >> index) & 1) === 0 ? a : b);
      const result = pairSemifinals(entrants, winners.map((winner) => winner.teamId), "solari_high_vs_lunari_low", "outer_seeds");
      expect(result.blockingReason, `winner mask ${mask}`).toBeNull();
      expect(result.matches).toHaveLength(2);
      const participants = result.matches.flatMap((match) => [match.teamA.teamId, match.teamB.teamId]);
      expect(new Set(participants).size).toBe(4);
      expect([...participants].sort()).toEqual(winners.map((winner) => winner.teamId).sort());
      if (winners.filter((winner) => winner.division === "Solari").length === 3) {
        expect(result.matches.some((match) => match.teamA.division !== match.teamB.division)).toBe(true);
      }
    }
  });

  it("blocks 2/2 and 4/0 when their unconfirmed league policies are absent", () => {
    const twoAndTwo = entrants.slice(0, 2).concat(entrants.slice(4, 6)).map((team) => team.teamId);
    expect(pairSemifinals(entrants, twoAndTwo, null, null).blockingReason).toContain("2/2");
    const allSolari = entrants.slice(0, 4).map((team) => team.teamId);
    expect(pairSemifinals(entrants, allSolari, null, null).blockingReason).toContain("league ruling");
  });

  it("supports both policy choices with original seed order", () => {
    const twoAndTwo = ["s1", "s4", "l1", "l4"];
    expect(pairSemifinals(entrants, twoAndTwo, "solari_high_vs_lunari_low", null).matches.map(({ teamA, teamB }) => [teamA.teamId, teamB.teamId])).toEqual([
      ["s1", "l4"], ["l1", "s4"],
    ]);
    expect(pairSemifinals(entrants, ["s1", "s2", "s3", "s4"], null, "adjacent_seeds").matches.map(({ teamA, teamB }) => [teamA.teamId, teamB.teamId])).toEqual([
      ["s1", "s2"], ["s3", "s4"],
    ]);
  });
});

describe("resolvePlayoffSeries", () => {
  it.each([[3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3]])("accepts a complete Bo5 score %i-%i", (scoreA, scoreB) => {
    const result = resolvePlayoffSeries(fixture({ score_a: scoreA, score_b: scoreB }), entrants, []);
    expect(result.status).toBe("ready");
    expect(result.winnerTeamId).toBe(scoreA === 3 ? "s1" : "l4");
    expect(result.source).toBe("fixture_score");
  });

  it("uses a reversed-side pending report as provisional evidence", () => {
    const result = resolvePlayoffSeries(fixture(), entrants, [report({
      team_a_id: "l4",
      team_b_id: "s1",
      score_a: 1,
      score_b: 3,
      status: "needs_sides",
      games: [{ id: "g1", game_number: 1, status: "needs_side" }],
    })]);
    expect(result).toMatchObject({ status: "ready", winnerTeamId: "s1", scoreA: 3, scoreB: 1, source: "report", provisional: true });
    expect(result.sourceReportIds).toContain("report-1");
  });

  it("rejects malformed scores, wrong participants, and failed reports", () => {
    expect(resolvePlayoffSeries(fixture(), entrants, [report({ score_a: 2, score_b: 1 })]).status).toBe("blocked");
    expect(resolvePlayoffSeries(fixture(), entrants, [report({ team_b_id: "s2" })]).warnings.join(" ")).toContain("outside this fixture");
    expect(resolvePlayoffSeries(fixture(), entrants, [report({ status: "failed" })]).blockingReason).toContain("failed");
  });

  it("surfaces report conflicts and official-score disagreements", () => {
    const second = report({ id: "report-2", score_a: 3, score_b: 2 });
    expect(resolvePlayoffSeries(fixture(), entrants, [report(), second]).blockingReason).toContain("conflict");
    expect(resolvePlayoffSeries(fixture({ score_a: 3, score_b: 1 }), entrants, [report({ score_a: 0, score_b: 3 })]).blockingReason).toContain("disagrees");
  });

  it("preserves a forfeit result without inventing game rows", () => {
    const result = resolvePlayoffSeries(fixture(), entrants, [report({
      status: "forfeit",
      score_a: 3,
      score_b: 0,
      forfeit_team_id: "l4",
      games: [],
    })]);
    expect(result).toMatchObject({ status: "ready", winnerTeamId: "s1", source: "report", provisional: false });
  });
});

describe("advancement preview", () => {
  it("includes result IDs and versions, and keeps the final participants tied to the two series", () => {
    const semiA = makeFixture("semi-a", 0, entrants[0], entrants[7], entrants[0]);
    const semiB = makeFixture("semi-b", 1, entrants[4], entrants[3], entrants[4]);
    const preview = buildAdvancementPreview("finals", [semiA, semiB], [fixture({ id: "final", stage: "finals", team_a: null, team_b: null })], entrants, [], { policy22: null, policy40: null });
    expect(preview.status).toBe("ready");
    expect(preview.sourceFixtureIds).toEqual(["semi-a", "semi-b"]);
    expect(preview.matches[0]).toMatchObject({ teamA: { teamId: "s1" }, teamB: { teamId: "l1" } });
    expect(preview.resultVersions).toHaveLength(2);
  });
});
