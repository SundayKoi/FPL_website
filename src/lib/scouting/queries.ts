import type { SupabaseClient } from "@supabase/supabase-js";
import { seasonBelongsToLeague } from "@/lib/league/season";
import type { MatchDraftAction, MatchDraftPositions } from "@/lib/match-draft/types";
import { normalizeName } from "@/lib/captain/teamNames";
import { createLeagueFixtureScope } from "@/lib/my-team/leagueScope";
import type { ScoutDraftRow, ScoutFixtureRow, ScoutHistory, ScoutRosterPlayer } from "./types";
import { parseDrafterPage } from "./drafter";
import {
  buildIngestedScoutingGames,
  buildInhousePlayerStats,
  type IngestedMatchReference,
  type IngestedScoutingGame,
  type IngestedScoutingGameRow,
  type InhouseGameRow,
  type InhousePlayerStats,
} from "./inhouse";

export const FIXTURE_COLUMNS =
  "id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b";
export const DRAFT_COLUMNS =
  "id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, actions, positions, created_at";
export const INGESTED_SCOUTING_COLUMNS =
  "id, match_id, game_date, season, summoner_name, tag, champion, team_side, win";
const TEAM_COLUMNS = "id, name, abbreviation";
const REPORT_COLUMNS = "id, fixture_id, season, draft_url, team_a_id, team_b_id";
const REPORT_GAME_COLUMNS = "id, report_id, game_number, blue_team_id";
const SCOUTING_PAGE_SIZE = 1000;
const SCOUTING_MAX_PAGES = 100;

export interface FetchScoutingHistoryInput {
  league: "premier" | "academy";
  leagueTeamNames: Iterable<string>;
}

type UnknownRow = Record<string, unknown>;

const asRows = (data: unknown): UnknownRow[] =>
  Array.isArray(data) ? data.filter((row): row is UnknownRow => Boolean(row) && typeof row === "object") : [];

const asNullableString = (value: unknown): string | null => typeof value === "string" ? value : null;
const asNumber = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

async function fetchAllScoutingRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < SCOUTING_MAX_PAGES; page += 1) {
    const from = page * SCOUTING_PAGE_SIZE;
    const { data, error } = await buildPage(from, from + SCOUTING_PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < SCOUTING_PAGE_SIZE) return rows;
  }
  throw new Error("scouting query exceeded the page limit");
}

function validAction(value: unknown): value is MatchDraftAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  if (action.kind !== "pick" && action.kind !== "ban") return false;
  if (action.champion !== null && typeof action.champion !== "string") return false;
  if (action.side !== undefined && action.side !== "blue" && action.side !== "red") return false;
  if (action.stepIndex !== undefined && asNumber(action.stepIndex) === null) return false;
  if (action.slot !== undefined && asNumber(action.slot) === null) return false;
  if (action.skipped !== undefined && typeof action.skipped !== "boolean") return false;
  if (action.playerName !== undefined && action.playerName !== null && typeof action.playerName !== "string") return false;
  return true;
}

function validPositionSide(value: unknown): value is (string | null)[] {
  return Array.isArray(value) && value.every((entry) => entry === null || typeof entry === "string");
}

function mapPositions(value: unknown): MatchDraftPositions | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const positions: MatchDraftPositions = {};
  if (validPositionSide(raw.blue)) positions.blue = [...raw.blue];
  if (validPositionSide(raw.red)) positions.red = [...raw.red];
  return positions.blue || positions.red ? positions : null;
}

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
  const actions = Array.isArray(row.actions) ? row.actions.filter(validAction) : [];
  const positions = mapPositions(row.positions);
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

function isDrafterUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "drafter.lol" && url.pathname.startsWith("/draft/");
  } catch {
    return false;
  }
}

function drafterGameUrl(value: string, gameNumber: number): string {
  const url = new URL(value);
  url.searchParams.set("game", String(gameNumber));
  return url.toString();
}

function teamPairKey(teamA: string | null, teamB: string | null): string | null {
  const names = [normalizeName(teamA), normalizeName(teamB)].filter(Boolean).sort();
  return names.length === 2 ? names.join("::") : null;
}

function fixtureSlotKey(
  fixture: ScoutFixtureRow,
  teamNameAliases: ReadonlyMap<string, string> = new Map(),
): string | null {
  const resolveTeamName = (name: string | null) => teamNameAliases.get(normalizeName(name)) ?? name;
  const pair = teamPairKey(resolveTeamName(fixture.team_a), resolveTeamName(fixture.team_b));
  return pair ? `${fixture.stage}::${pair}` : null;
}

/**
 * The Academy season split was added after Week 1 had already been played.
 * The schedule seeder preserves any old fixture carrying a report, then
 * writes the canonical A1 fixture beside it. Keep those old ids as aliases
 * while the read path converges history onto the canonical fixture.
 */
function buildLegacyAcademyFixtureAliases(
  allFixtures: ScoutFixtureRow[],
  academyFixtures: ScoutFixtureRow[],
  league: FetchScoutingHistoryInput["league"],
  teamNameAliases: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  if (league !== "academy") return new Map();

  const canonicalBySlot = new Map<string, ScoutFixtureRow[]>();
  for (const fixture of academyFixtures) {
    const slot = fixtureSlotKey(fixture, teamNameAliases);
    if (slot) canonicalBySlot.set(slot, [...(canonicalBySlot.get(slot) ?? []), fixture]);
  }

  const aliases = new Map<string, string>();
  for (const fixture of allFixtures) {
    if (seasonBelongsToLeague(fixture.season, "academy")) continue;
    const slot = fixtureSlotKey(fixture, teamNameAliases);
    const candidates = slot ? canonicalBySlot.get(slot) ?? [] : [];
    if (candidates.length === 1 && candidates[0].id !== fixture.id) {
      aliases.set(fixture.id, candidates[0].id);
    }
  }
  return aliases;
}

function resolveReportFixtureIds(
  reports: UnknownRow[],
  fixtures: ScoutFixtureRow[],
  fixturesById: Map<string, ScoutFixtureRow>,
  teamNamesById: Map<string, string>,
  fixtureIdAliases: ReadonlyMap<string, string> = new Map(),
  league: FetchScoutingHistoryInput["league"] = "premier",
): UnknownRow[] {
  const fixturesBySeasonAndPair = new Map<string, ScoutFixtureRow[]>();
  const fixturesByPair = new Map<string, ScoutFixtureRow[]>();
  for (const fixture of fixtures) {
    const pair = teamPairKey(fixture.team_a, fixture.team_b);
    if (!pair) continue;
    const key = `${fixture.season}::${pair}`;
    fixturesBySeasonAndPair.set(key, [...(fixturesBySeasonAndPair.get(key) ?? []), fixture]);
    fixturesByPair.set(pair, [...(fixturesByPair.get(pair) ?? []), fixture]);
  }

  return reports.flatMap((report) => {
    const explicitFixtureId = asNullableString(report.fixture_id);
    const resolvedExplicitFixtureId = explicitFixtureId
      ? (fixturesById.has(explicitFixtureId) ? explicitFixtureId : fixtureIdAliases.get(explicitFixtureId) ?? null)
      : null;
    if (resolvedExplicitFixtureId) {
      return [{ ...report, fixture_id: resolvedExplicitFixtureId }];
    }

    const season = asNullableString(report.season);
    const teamA = asNullableString(report.team_a_id);
    const teamB = asNullableString(report.team_b_id);
    const pair = teamPairKey(
      teamA ? teamNamesById.get(teamA) ?? null : null,
      teamB ? teamNamesById.get(teamB) ?? null : null,
    );
    if (!season || !pair) return [];
    let candidates = fixturesBySeasonAndPair.get(`${season}::${pair}`) ?? [];
    // Reports submitted before the Academy season split can still carry the
    // shared Premier code (S5). The fixture pair is the safe fallback here:
    // candidates already come from the selected Academy team scope and an
    // ambiguous pair is rejected rather than guessed.
    if (candidates.length === 0 && league === "academy" && !seasonBelongsToLeague(season, "academy")) {
      candidates = fixturesByPair.get(pair) ?? [];
    }
    return candidates.length === 1
      ? [{ ...report, fixture_id: candidates[0].id }]
      : [];
  });
}

async function loadReportedDrafts(
  reports: UnknownRow[],
  reportGames: UnknownRow[],
  fixturesById: Map<string, ScoutFixtureRow>,
  teamNamesById: Map<string, string>,
): Promise<ScoutDraftRow[]> {
  const gamesByReport = new Map<string, UnknownRow[]>();
  for (const game of reportGames) {
    const reportId = asNullableString(game.report_id);
    if (!reportId) continue;
    gamesByReport.set(reportId, [...(gamesByReport.get(reportId) ?? []), game]);
  }

  const loaded = await Promise.all(reports.map(async (report) => {
    const reportId = asNullableString(report.id);
    const fixtureId = asNullableString(report.fixture_id);
    const url = report.draft_url;
    const fixture = fixtureId ? fixturesById.get(fixtureId) : undefined;
    if (!reportId || !fixtureId || !fixture || !isDrafterUrl(url)) return [];

    const gameSides: Record<number, { blueTeamName: string | null; redTeamName: string | null }> = {};
    const reportTeamA = asNullableString(report.team_a_id);
    const reportTeamB = asNullableString(report.team_b_id);
    const reportTeamAName = (reportTeamA && teamNamesById.get(reportTeamA)) ?? fixture.team_a;
    const reportTeamBName = (reportTeamB && teamNamesById.get(reportTeamB)) ?? fixture.team_b;
    for (const game of gamesByReport.get(reportId) ?? []) {
      const gameNumber = asNumber(game.game_number);
      const blueTeamId = asNullableString(game.blue_team_id);
      if (!gameNumber || !blueTeamId) continue;
      gameSides[gameNumber] = blueTeamId === reportTeamB
        ? { blueTeamName: reportTeamBName, redTeamName: reportTeamAName }
        : blueTeamId === reportTeamA
          ? { blueTeamName: reportTeamAName, redTeamName: reportTeamBName }
          : { blueTeamName: fixture.team_a, redTeamName: fixture.team_b };
    }

    const loadPage = async (gameNumber?: number): Promise<ScoutDraftRow[]> => {
      try {
        const response = await fetch(gameNumber === undefined ? url : drafterGameUrl(url, gameNumber), {
          cache: "no-store",
          headers: { accept: "text/html", "user-agent": "FPL scouting history" },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) return [];
        const parsed = parseDrafterPage(await response.text(), {
          fixtureId,
          blueTeamName: fixture.team_a,
          redTeamName: fixture.team_b,
          gameSides,
        });
        if (gameNumber === undefined) return parsed;

        const matching = parsed.filter((draft) => draft.game_number === gameNumber);
        if (matching.length > 0) return matching;
        if (parsed.length !== 1) return [];

        const sideNames = gameSides[gameNumber];
        return [{
          ...parsed[0],
          id: `drafter:${fixtureId}:${gameNumber}`,
          game_number: gameNumber,
          blue_team_name: sideNames?.blueTeamName ?? parsed[0].blue_team_name,
          red_team_name: sideNames?.redTeamName ?? parsed[0].red_team_name,
        }];
      } catch {
        return [];
      }
    };

    const gameNumbers = [...new Set(
      (gamesByReport.get(reportId) ?? [])
        .map((game) => asNumber(game.game_number))
        .filter((gameNumber): gameNumber is number => gameNumber !== null),
    )];
    if (gameNumbers.length === 0) return loadPage();
    return (await Promise.all(gameNumbers.map((gameNumber) => loadPage(gameNumber)))).flat();
  }));
  return loaded.flat();
}

/** Load all compact draft history belonging to the currently selected league. */
export async function fetchScoutingHistory(
  supabase: SupabaseClient,
  input: FetchScoutingHistoryInput,
): Promise<ScoutHistory> {
  const [fixtureRows, draftRows, teamRows, reportRows, reportGameRows] = await Promise.all([
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("fixtures").select(FIXTURE_COLUMNS).order("id").range(from, to)),
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("match_drafts").select(DRAFT_COLUMNS).order("id").range(from, to)),
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("league_teams").select(TEAM_COLUMNS).order("id").range(from, to)),
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("match_reports").select(REPORT_COLUMNS).order("id").range(from, to)),
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("match_report_games").select(REPORT_GAME_COLUMNS).order("id").range(from, to)),
  ]);

  const scope = createLeagueFixtureScope(input.leagueTeamNames);
  const allFixtures = asRows(fixtureRows)
    .map(mapFixture)
    .filter((fixture): fixture is ScoutFixtureRow => Boolean(fixture));
  const fixtures = allFixtures
    .filter((fixture): fixture is ScoutFixtureRow => Boolean(
      seasonBelongsToLeague(fixture.season, input.league) &&
      scope.includesFixture(fixture),
    ));
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const fixtureIds = new Set(fixturesById.keys());
  const teamNameAliases = new Map(
    asRows(teamRows).flatMap((row) => {
      const name = asNullableString(row.name);
      const abbreviation = asNullableString(row.abbreviation);
      return name && abbreviation
        ? [[normalizeName(abbreviation), name] as const]
        : [];
    }),
  );
  const fixtureIdAliases = buildLegacyAcademyFixtureAliases(allFixtures, fixtures, input.league, teamNameAliases);
  const teamNamesById = new Map(
    asRows(teamRows)
      .flatMap((row) => {
        const id = asNullableString(row.id);
        const name = asNullableString(row.name);
        return id && name ? [[id, name] as const] : [];
      }),
  );
  const drafts = asRows(draftRows)
    .map(mapDraft)
    .map((draft) => draft
      ? { ...draft, fixture_id: fixtureIdAliases.get(draft.fixture_id) ?? draft.fixture_id }
      : null)
    .filter((draft): draft is ScoutDraftRow => Boolean(draft && fixtureIds.has(draft.fixture_id)))
    .map((draft) => {
      const fixture = fixturesById.get(draft.fixture_id);
      return fixture
        ? {
            ...draft,
            blue_team_name: draft.blue_team_name ?? fixture.team_a,
            red_team_name: draft.red_team_name ?? fixture.team_b,
          }
        : draft;
    });
  const reports = resolveReportFixtureIds(asRows(reportRows), fixtures, fixturesById, teamNamesById, fixtureIdAliases, input.league)
    .filter((report) => fixtureIds.has(asNullableString(report.fixture_id) ?? ""));
  const reportedDrafts = await loadReportedDrafts(reports, asRows(reportGameRows), fixturesById, teamNamesById);
  for (const reportedDraft of reportedDrafts) {
    const current = drafts.find((draft) => draft.fixture_id === reportedDraft.fixture_id && draft.game_number === reportedDraft.game_number);
    if (!current || current.actions.length === 0) drafts.push(reportedDraft);
  }
  return { fixtures, drafts };
}

/** Load Riot-ingested game rows used to identify champions when a draft did
 * not record player names or post-draft role confirmation. The league
 * boundary is applied before roster matching because player identities can
 * recur across the two shared stats histories. */
export async function fetchIngestedScoutingGames(
  supabase: SupabaseClient,
  roster: Array<{ id: string; displayName: string; role: ScoutRosterPlayer["role"]; opggUrl?: string | null }>,
  fixtures: ScoutFixtureRow[] = [],
  league: FetchScoutingHistoryInput["league"] = "premier",
): Promise<IngestedScoutingGame[]> {
  const allRows = await fetchAllScoutingRows<IngestedScoutingGameRow>((from, to) => supabase
      .from("raw_stats")
      .select(INGESTED_SCOUTING_COLUMNS)
      .order("id")
      .range(from, to));
  if (allRows.length === 0) return buildIngestedScoutingGames(roster, allRows);

  const [reportGames, reports] = await Promise.all([
    fetchAllScoutingRows<{ id: string; match_id: string | null; report_id: string | null; game_number: number | null }>((from, to) => supabase
      .from("match_report_games")
      .select("id, match_id, report_id, game_number")
      .order("id")
      .range(from, to)),
    fetchAllScoutingRows<UnknownRow>((from, to) => supabase
      .from("match_reports")
      .select(REPORT_COLUMNS)
      .order("id")
      .range(from, to)),
  ]);
  const teamRows = fixtures.length
    ? await fetchAllScoutingRows<UnknownRow>((from, to) => supabase.from("league_teams").select(TEAM_COLUMNS).order("id").range(from, to))
    : [];
  const fixtureIdsByReportId = new Map(
    (fixtures.length
      ? resolveReportFixtureIds(asRows(reports), fixtures, new Map(fixtures.map((fixture) => [fixture.id, fixture])), new Map(asRows(teamRows).flatMap((row) => {
          const id = asNullableString(row.id);
          const name = asNullableString(row.name);
          return id && name ? [[id, name] as const] : [];
        })), new Map(), league)
      : asRows(reports))
      .flatMap((row) => {
        const id = asNullableString(row.id);
        const fixtureId = asNullableString(row.fixture_id);
        return id && fixtureId ? [[id, fixtureId] as const] : [];
      }),
  );
  const fixtureIdsByMatchId = new Map<string, IngestedMatchReference>(
    reportGames
      .flatMap((row) => {
        const fixtureId = row.report_id ? fixtureIdsByReportId.get(row.report_id) : null;
        return row.match_id && fixtureId
          ? [[row.match_id, { fixtureId, gameNumber: row.game_number }] as const]
          : [];
      }),
  );
  const fixtureSeasonsById = new Map(fixtures.map((fixture) => [fixture.id, fixture.season]));
  const rows = allRows
    .filter((row) => seasonBelongsToLeague(row.season, league) || (
      league === "academy" &&
      Boolean(row.match_id && fixtureIdsByMatchId.has(row.match_id))
    ))
    .map((row) => {
      const reference = row.match_id ? fixtureIdsByMatchId.get(row.match_id) : undefined;
      const fixtureSeason = reference ? fixtureSeasonsById.get(reference.fixtureId) : undefined;
      return fixtureSeason && !seasonBelongsToLeague(row.season, league)
        ? { ...row, season: fixtureSeason }
        : row;
    });
  return buildIngestedScoutingGames(roster, rows, fixtureIdsByMatchId);
}

/** Load all in-house games and correlate them to the selected roster. */
export async function fetchInhousePlayerStats(
  supabase: SupabaseClient,
  roster: Array<{ id: string; displayName: string; role: ScoutRosterPlayer["role"]; opggUrl?: string | null }>,
): Promise<InhousePlayerStats[]> {
  const pageSize = 1000;
  const rows: InhouseGameRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("inhouse_stats")
      .select("summoner_name, champion, kills, deaths, assists, win")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as InhouseGameRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return buildInhousePlayerStats(roster, rows);
}
