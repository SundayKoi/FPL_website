import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeTeamName } from "@/lib/league/context";
import type { MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import type { ScoutDraftRow, ScoutFixtureRow, ScoutHistory } from "./types";

export const FIXTURE_COLUMNS =
  "id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b";
export const DRAFT_COLUMNS =
  "id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, actions, positions, created_at";

export interface FetchScoutingHistoryInput {
  league: "premier" | "academy";
  leagueTeamNames: Iterable<string>;
}

type UnknownRow = Record<string, unknown>;

const asRows = (data: unknown): UnknownRow[] =>
  Array.isArray(data) ? data.filter((row): row is UnknownRow => Boolean(row) && typeof row === "object") : [];

const asNullableString = (value: unknown): string | null => typeof value === "string" ? value : null;
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function mapFixture(row: UnknownRow): ScoutFixtureRow | null {
  if (typeof row.id !== "string" || typeof row.season !== "string" || typeof row.stage !== "string") return null;
  return {
    id: row.id,
    season: row.season,
    stage: row.stage as ScoutFixtureRow["stage"],
    team_a: asNullableString(row.team_a),
    team_b: asNullableString(row.team_b),
    scheduled_at: asNullableString(row.scheduled_at),
    best_of: row.best_of as ScoutFixtureRow["best_of"],
    score_a: asNumber(row.score_a),
    score_b: asNumber(row.score_b),
  };
}

function mapDraft(row: UnknownRow): ScoutDraftRow | null {
  if (typeof row.id !== "string" || typeof row.fixture_id !== "string" || typeof row.game_number !== "number") return null;
  const actions = Array.isArray(row.actions) ? row.actions as MatchDraftAction[] : [];
  const positions = row.positions && typeof row.positions === "object" ? row.positions as MatchDraftPositions : null;
  return {
    id: row.id,
    fixture_id: row.fixture_id,
    game_number: row.game_number,
    blue_team_name: asNullableString(row.blue_team_name),
    red_team_name: asNullableString(row.red_team_name),
    winner_team: asNullableString(row.winner_team),
    actions,
    positions,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/** Load all compact draft history belonging to the currently selected league. */
export async function fetchScoutingHistory(
  supabase: SupabaseClient,
  input: FetchScoutingHistoryInput,
): Promise<ScoutHistory> {
  const [fixtureResult, draftResult] = await Promise.all([
    supabase.from("fixtures").select(FIXTURE_COLUMNS),
    supabase.from("match_drafts").select(DRAFT_COLUMNS),
  ]);
  if (fixtureResult.error) throw fixtureResult.error;
  if (draftResult.error) throw draftResult.error;

  const names = new Set([...input.leagueTeamNames].map(normalizeTeamName).filter(Boolean));
  const fixtures = asRows(fixtureResult.data)
    .map(mapFixture)
    .filter((fixture): fixture is ScoutFixtureRow => {
      if (!fixture) return false;
      const teamA = names.has(normalizeTeamName(fixture.team_a));
      const teamB = names.has(normalizeTeamName(fixture.team_b));
      return input.league === "academy" ? teamA || teamB : teamA && teamB;
    });
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));
  const drafts = asRows(draftResult.data)
    .map(mapDraft)
    .filter((draft): draft is ScoutDraftRow => Boolean(draft && fixtureIds.has(draft.fixture_id)));
  return { fixtures, drafts };
}
