import { hasResult } from "@/lib/schedule/format";
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
