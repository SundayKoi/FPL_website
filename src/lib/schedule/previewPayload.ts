import type { FixtureRow } from "./types";
import type { PlayoffReport, PlayoffReportGame, PlayoffAdvancementPreview } from "./playoffs";

export interface PlayoffReportWithGames extends PlayoffReport {
  games: PlayoffReportGame[];
}

export interface PlayoffPublishPayload {
  config_version: number;
  source_snapshots: Record<string, unknown>[];
  target_fixture_ids: string[];
  matches: { sort_order: number; team_a_id: string; team_b_id: string }[];
}

/** Mirrors private.playoff_source_snapshot so publish can reject a stale UI preview. */
export function playoffSourceSnapshot(
  fixture: FixtureRow,
  reports: PlayoffReportWithGames[],
): Record<string, unknown> {
  return {
    fixture: {
      id: fixture.id,
      season: fixture.season,
      stage: fixture.stage,
      sort_order: fixture.sort_order,
      team_a: fixture.team_a,
      team_b: fixture.team_b,
      best_of: fixture.best_of,
      score_a: fixture.score_a,
      score_b: fixture.score_b,
    },
    reports: reports
      .filter((report) => report.fixture_id === fixture.id)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((report) => ({
        id: report.id,
        fixture_id: report.fixture_id,
        season: report.season,
        season_phase: report.season_phase,
        team_a_id: report.team_a_id,
        team_b_id: report.team_b_id,
        score_a: report.score_a,
        score_b: report.score_b,
        status: report.status,
        submitted_at: report.submitted_at,
        forfeit_team_id: report.forfeit_team_id ?? null,
        games: [...report.games]
          .sort((a, b) => a.game_number - b.game_number || a.id.localeCompare(b.id))
          .map(({ id, game_number, status }) => ({ id, game_number, status })),
      })),
  };
}

export function buildPlayoffPublishPayload(
  preview: PlayoffAdvancementPreview,
  configVersion: number,
  sourceFixtures: FixtureRow[],
  targetFixtures: FixtureRow[],
  reports: PlayoffReportWithGames[],
): PlayoffPublishPayload {
  return {
    config_version: configVersion,
    source_snapshots: [...sourceFixtures]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((fixture) => playoffSourceSnapshot(fixture, reports)),
    target_fixture_ids: [...targetFixtures]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((fixture) => fixture.id),
    matches: preview.matches
      .map(({ sortOrder, teamA, teamB }) => ({
        sort_order: sortOrder,
        team_a_id: teamA.teamId,
        team_b_id: teamB.teamId,
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}
