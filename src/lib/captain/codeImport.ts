import { hasResult } from "@/lib/schedule/format";
import { normalizeName } from "@/lib/captain/teamNames";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";

export interface CodeImportPreviewFixture {
  fixtureId: string;
  stage: FixtureStage;
  teamA: string | null;
  teamB: string | null;
  codes: [string, string, string];
}

export interface CodeImportPreview {
  fixtures: CodeImportPreviewFixture[];
  unusedCount: number;
  requiredCodeCount: number;
}

const STAGE_RANK: Record<FixtureStage, number> = {
  week_1: 0,
  week_2: 1,
  week_3: 2,
  week_4: 3,
  week_5: 4,
  gauntlet_r1: 5,
  gauntlet_r2: 6,
  quarterfinals: 7,
  semifinals: 8,
  finals: 9,
};

export const POSTSEASON_STAGES = [
  "gauntlet_r1",
  "gauntlet_r2",
  "quarterfinals",
  "semifinals",
  "finals",
] as const satisfies readonly FixtureStage[];

export type PostseasonCodeScope = "gauntlet" | "playoffs" | "all-postseason";

const POSTSEASON_SCOPE_STAGES: Record<PostseasonCodeScope, readonly FixtureStage[]> = {
  gauntlet: ["gauntlet_r1", "gauntlet_r2"],
  playoffs: ["quarterfinals", "semifinals", "finals"],
  "all-postseason": POSTSEASON_STAGES,
};

export interface PostseasonCodeSlot {
  gameNumber: number;
  code: string;
}

export interface PostseasonCodeAssignment extends PostseasonCodeSlot {
  fixtureId: string;
}

export interface PostseasonFixtureSnapshot {
  id: string;
  stage: FixtureStage;
  sortOrder: number;
  teamA: string | null;
  teamB: string | null;
  bestOf: 1 | 3 | 5;
  scoreA: number | null;
  scoreB: number | null;
}

export interface PostseasonExistingCodeSnapshot {
  id: string;
  fixtureId: string;
  gameNumber: number;
  code: string;
}

export interface PostseasonPreviewFixture {
  fixtureId: string;
  stage: FixtureStage;
  teamA: string | null;
  teamB: string | null;
  bestOf: 1 | 3 | 5;
  existing: PostseasonCodeSlot[];
  missingGameNumbers: number[];
  assignments: PostseasonCodeAssignment[];
}

export type PostseasonSkipReason = "scored" | "tbd-opponent" | "complete";

export interface PostseasonSkippedFixture {
  fixtureId: string;
  stage: FixtureStage;
  teamA: string | null;
  teamB: string | null;
  bestOf: 1 | 3 | 5;
  reason: PostseasonSkipReason;
}

export interface PostseasonCodePreview {
  scope: PostseasonCodeScope;
  fixtures: PostseasonPreviewFixture[];
  skippedFixtures: PostseasonSkippedFixture[];
  assignments: PostseasonCodeAssignment[];
  fixtureSnapshot: PostseasonFixtureSnapshot[];
  existingCodeSnapshot: PostseasonExistingCodeSnapshot[];
  requiredCodeCount: number;
  existingCodeCount: number;
  unusedCount: number;
}

export function postseasonStages(scope: PostseasonCodeScope): readonly FixtureStage[] {
  return POSTSEASON_SCOPE_STAGES[scope];
}

export function isPostseasonStage(stage: FixtureStage): boolean {
  return (POSTSEASON_STAGES as readonly FixtureStage[]).includes(stage);
}

function stripSurroundingQuotes(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

export function parseTournamentCodes(input: string): string[] {
  const codes = input
    .split(/[\r\n,]+/)
    .map((token) => stripSurroundingQuotes(token.trim()).trim())
    .filter((token) => token.length > 0);

  if (codes.length === 0) {
    throw new Error("No tournament codes found");
  }

  return codes;
}

function targetFixturesForPreview(fixtures: FixtureRow[]): FixtureRow[] {
  return [...fixtures]
    .filter((fixture) => !hasResult(fixture))
    .sort((a, b) => {
      const rankDiff = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
      if (rankDiff !== 0) return rankDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id.localeCompare(b.id);
    });
}

export function buildCodeImportPreview(fixtures: FixtureRow[], codes: string[]): CodeImportPreview {
  const targetFixtures = targetFixturesForPreview(fixtures);
  const requiredCodeCount = targetFixtures.length * 3;

  if (codes.length < requiredCodeCount) {
    throw new Error(
      `Need at least ${requiredCodeCount} tournament codes for ${targetFixtures.length} target fixture${
        targetFixtures.length === 1 ? "" : "s"
      }.`,
    );
  }

  const previewFixtures: CodeImportPreviewFixture[] = targetFixtures.map((fixture, index) => {
    const offset = index * 3;
    return {
      fixtureId: fixture.id,
      stage: fixture.stage,
      teamA: fixture.team_a,
      teamB: fixture.team_b,
      codes: [codes[offset], codes[offset + 1], codes[offset + 2]],
    };
  });

  return {
    fixtures: previewFixtures,
    unusedCount: codes.length - requiredCodeCount,
    requiredCodeCount,
  };
}

function sortPostseasonFixtures(a: FixtureRow, b: FixtureRow): number {
  const rankDiff = STAGE_RANK[a.stage] - STAGE_RANK[b.stage];
  if (rankDiff !== 0) return rankDiff;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.id.localeCompare(b.id);
}

function normalizedCodes(codes: string[]): string[] {
  return codes.map((code) => code.trim()).filter(Boolean);
}

function assertNoDuplicateCodes(codes: string[], existingCodes: PostseasonExistingCodeSnapshot[]): void {
  const seen = new Set<string>();
  for (const code of codes) {
    const key = code.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate tournament code: ${code}`);
    seen.add(key);
  }

  const existing = new Set(existingCodes.map((code) => code.code.trim().toLocaleLowerCase()));
  const reused = codes.find((code) => existing.has(code.toLocaleLowerCase()));
  if (reused) throw new Error(`Tournament code is already assigned: ${reused}`);
}

function snapshotForFixture(fixture: FixtureRow): PostseasonFixtureSnapshot {
  return {
    id: fixture.id,
    stage: fixture.stage,
    sortOrder: fixture.sort_order,
    teamA: fixture.team_a,
    teamB: fixture.team_b,
    bestOf: fixture.best_of,
    scoreA: fixture.score_a,
    scoreB: fixture.score_b,
  };
}

/**
 * Allocates newly supplied tournament codes to postseason game slots without
 * replacing anything already assigned. The returned snapshots are sent back
 * to the RPC so the database can reject a preview that no longer describes
 * the locked fixtures and codes.
 */
export function buildPostseasonCodePreview(
  fixtures: FixtureRow[],
  existingCodes: PostseasonExistingCodeSnapshot[],
  codes: string[],
  scope: PostseasonCodeScope,
  teams: LeagueTeam[],
): PostseasonCodePreview {
  const stageSet = new Set(postseasonStages(scope));
  const targetFixtures = fixtures.filter((fixture) => stageSet.has(fixture.stage)).sort(sortPostseasonFixtures);
  if (targetFixtures.length === 0) {
    throw new Error("No postseason fixtures found for this selection.");
  }

  const parsedCodes = normalizedCodes(codes);
  const fixtureOrder = new Map(targetFixtures.map((fixture, index) => [fixture.id, index]));
  const existingCodeSnapshot = [...existingCodes]
    .filter((code) => code.fixtureId && fixtureOrder.has(code.fixtureId))
    .sort(
      (a, b) =>
        (fixtureOrder.get(a.fixtureId) ?? Number.MAX_SAFE_INTEGER) -
          (fixtureOrder.get(b.fixtureId) ?? Number.MAX_SAFE_INTEGER) ||
        a.gameNumber - b.gameNumber ||
        a.id.localeCompare(b.id),
    );
  assertNoDuplicateCodes(parsedCodes, existingCodes);

  const byFixture = new Map<string, PostseasonExistingCodeSnapshot[]>();
  for (const code of existingCodeSnapshot) {
    const list = byFixture.get(code.fixtureId) ?? [];
    list.push(code);
    byFixture.set(code.fixtureId, list);
  }

  const previewFixtures: PostseasonPreviewFixture[] = [];
  const skippedFixtures: PostseasonSkippedFixture[] = [];
  const missingSlots: { fixture: FixtureRow; gameNumber: number }[] = [];

  for (const fixture of targetFixtures) {
    const fixtureCodes = byFixture.get(fixture.id) ?? [];
    const existingByGame = new Map<number, PostseasonExistingCodeSnapshot>();
    for (const code of fixtureCodes) {
      if (code.gameNumber < 1 || code.gameNumber > fixture.best_of) {
        throw new Error(`Existing code for ${fixture.id} has invalid game number ${code.gameNumber}.`);
      }
      if (existingByGame.has(code.gameNumber)) {
        throw new Error(`Existing codes for ${fixture.id} contain duplicate game ${code.gameNumber}.`);
      }
      existingByGame.set(code.gameNumber, code);
    }

    if (hasResult(fixture)) {
      skippedFixtures.push({ ...fixture, reason: "scored", fixtureId: fixture.id, teamA: fixture.team_a, teamB: fixture.team_b, bestOf: fixture.best_of });
      continue;
    }
    if (!fixture.team_a?.trim() || !fixture.team_b?.trim()) {
      skippedFixtures.push({ ...fixture, reason: "tbd-opponent", fixtureId: fixture.id, teamA: fixture.team_a, teamB: fixture.team_b, bestOf: fixture.best_of });
      continue;
    }

    for (const teamName of [fixture.team_a, fixture.team_b]) {
      const matches = teams.filter((team) => normalizeName(team.name) === normalizeName(teamName));
      if (matches.length !== 1) {
        throw new Error(`Could not resolve an unambiguous league team name "${teamName}" on fixture ${fixture.id}.`);
      }
    }

    const missingGameNumbers = Array.from({ length: fixture.best_of }, (_, index) => index + 1).filter(
      (gameNumber) => !existingByGame.has(gameNumber),
    );
    if (missingGameNumbers.length === 0) {
      skippedFixtures.push({ ...fixture, reason: "complete", fixtureId: fixture.id, teamA: fixture.team_a, teamB: fixture.team_b, bestOf: fixture.best_of });
      continue;
    }

    for (const gameNumber of missingGameNumbers) missingSlots.push({ fixture, gameNumber });
    previewFixtures.push({
      fixtureId: fixture.id,
      stage: fixture.stage,
      teamA: fixture.team_a,
      teamB: fixture.team_b,
      bestOf: fixture.best_of,
      existing: fixtureCodes.map((code) => ({ gameNumber: code.gameNumber, code: code.code })),
      missingGameNumbers,
      assignments: [],
    });
  }

  if (parsedCodes.length < missingSlots.length) {
    throw new Error(
      `Need at least ${missingSlots.length} new tournament code${missingSlots.length === 1 ? "" : "s"} for the missing postseason slots.`,
    );
  }

  const assignments = missingSlots.map(({ fixture, gameNumber }, index) => ({
    fixtureId: fixture.id,
    gameNumber,
    code: parsedCodes[index],
  }));
  const assignmentsByFixture = new Map<string, PostseasonCodeAssignment[]>();
  for (const assignment of assignments) {
    const list = assignmentsByFixture.get(assignment.fixtureId) ?? [];
    list.push(assignment);
    assignmentsByFixture.set(assignment.fixtureId, list);
  }
  for (const fixture of previewFixtures) {
    fixture.assignments = assignmentsByFixture.get(fixture.fixtureId) ?? [];
  }

  return {
    scope,
    fixtures: previewFixtures,
    skippedFixtures,
    assignments,
    fixtureSnapshot: targetFixtures.map(snapshotForFixture),
    existingCodeSnapshot,
    requiredCodeCount: missingSlots.length,
    existingCodeCount: existingCodeSnapshot.length,
    unusedCount: parsedCodes.length - missingSlots.length,
  };
}
