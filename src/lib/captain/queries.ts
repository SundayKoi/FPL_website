// Data layer for the private /captain page. Every fetcher takes a
// SupabaseClient (server or browser — both share the same interface, see
// src/lib/time.ts's fetchServerOffset for the existing precedent) so the
// same functions serve src/app/captain/page.tsx (createServerSupabase) and
// the client components that mutate after a user action
// (createClient) — see .superpowers/sdd/2026-08-11-match-reporting-auto-
// ingest/task-5-brief.md and docs/superpowers/specs/2026-08-11-captains-
// page-design.md.
//
// Row types for match_codes/announcements live here rather than in a
// separate types file: the brief's Files list for this task does not
// include one, and these tables (unlike Tasks 1-3's, which already had
// src/lib/matches/types.ts) have no existing TS shape to share. Field
// names/nullability mirror
// supabase/migrations/20260811100003_captain_page.sql exactly.

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { matchTeamId } from "@/lib/captain/teamNames";
import type { LeagueTeam, MatchReport, MatchReportGame, RiotAccount } from "@/lib/matches/types";
import type { Player } from "@/lib/draft/types";
import { resolvePlayerOpggUrl } from "@/lib/draft/playerMetadata";
import { DEFAULT_ACADEMY_SEASON } from "@/lib/league/season";
import { academyOpggUrlForPlayer } from "@/lib/academy/playerSheet";
import type { GameLogRow, PlayerAggRow } from "@/lib/stats/types";
import { createLeagueTeamScope } from "@/lib/my-team/leagueScope";

/** One row of `match_codes` — the one genuinely private table in the app. */
export interface MatchCode {
  id: string;
  fixture_id: string | null;
  season: string;
  team_a_id: string;
  team_b_id: string;
  game_number: number;
  code: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** One row of `announcements`. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
}

/** Resolved server-side context for the signed-in visitor. */
export interface CaptainContext {
  profileId: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  /** Every league team ever recorded — use for resolving historical names. */
  teams: LeagueTeam[];
  /** Teams still in use — use for anything a human picks from. */
  activeTeams: LeagueTeam[];
  myTeamId: string | null;
  season: string;
}

/** A `match_reports` row plus its `match_report_games` children, newest first. */
export interface MyReportRow extends MatchReport {
  games: MatchReportGame[];
}

/** The captain's featured-draft roster plus the Riot IDs on record for their team. */
export interface MyRosterData {
  draftPlayers: Player[];
  riotAccounts: (RiotAccount & { membershipId: string })[];
}

/** The team's ingested games and their players' aggregate stat lines. */
export interface MyResultsData {
  games: GameLogRow[];
  players: PlayerAggRow[];
}

export interface SubmitReportInput {
  season: string;
  phase: string;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  draftUrl: string | null;
  fixtureId: string | null;
  games: { gameNumber: number; matchId: string; blueTeamId: string | null }[];
}

/**
 * Resolves the signed-in visitor: admin flag, the canonical team list (for
 * pickers/switchers), which team (if any) they captain this season, and the
 * current season. Returns "empty" defaults (null profile, no captaincy) for
 * a signed-out visitor rather than throwing — src/app/captain/page.tsx
 * decides what to render from the shape, including the gate.
 */
/**
 * Key for matching a roster entry to a stats row. Riot game names may contain
 * spaces but never "#", so "name#tag" is unambiguous (and greppable -- an
 * earlier version used a literal NUL byte, which made this file read as binary).
 */
export function rosterKey(summonerName: string, tag: string): string {
  return `${summonerName}#${tag}`;
}

export function findDraftTeamId(teamName: string, draftTeams: { id: string; name: string }[]): string | null {
  const normalized = teamName.trim().toLowerCase();
  return draftTeams.find((team) => team.name.trim().toLowerCase() === normalized)?.id ?? null;
}

/**
 * Teams offered in human-facing pickers. `league_teams` accumulates every name
 * the league has ever used (historical stats seasons plus each draft), so
 * admins retire old ones with `active = false`; resolution paths still use the
 * full list so historical names keep matching.
 */
export function activeOnly(teams: LeagueTeam[]): LeagueTeam[] {
  return teams.filter((t) => t.active !== false);
}

export async function fetchCaptainContext(supabase: SupabaseClient, league: "premier" | "academy" = "premier"): Promise<CaptainContext> {
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id ?? null;

  const [profileResult, teamsResult, settingsResult] = await Promise.all([
    profileId
      ? supabase.from("profiles").select("is_admin, is_owner").eq("id", profileId).single()
      : Promise.resolve({ data: null as { is_admin: boolean; is_owner: boolean } | null }),
    supabase.from("league_teams").select("*").order("name"),
    supabase
      .from("league_settings")
      .select("current_season, academy_season, featured_draft_id, academy_draft_id")
      .eq("id", 1)
      .single(),
  ]);

  const isAdmin = profileResult.data?.is_admin ?? false;
  const isOwner = profileResult.data?.is_owner ?? false;
  let teams = (teamsResult.data as LeagueTeam[]) ?? [];
  const settings = settingsResult.data as { featured_draft_id?: string | null; academy_draft_id?: string | null } | null;
  const draftId = league === "academy" ? settings?.academy_draft_id : settings?.featured_draft_id;
  if (!draftId) teams = [];
  else {
    const { data: academyRows } = await supabase.from("teams").select("name").eq("draft_id", draftId);
    const names = new Set(((academyRows as { name: string }[]) ?? []).map((team) => team.name.trim().toLowerCase()));
    teams = teams.filter((team) => names.has(team.name.trim().toLowerCase()));
  }
  const activeTeams = activeOnly(teams);
  // Academy runs on its own season code, so every season-scoped fetch below
  // (reports, roster, results, fixtures, captaincy) stays inside its league.
  const season =
    (league === "academy"
      ? settingsResult.data?.academy_season ?? DEFAULT_ACADEMY_SEASON
      : settingsResult.data?.current_season) ?? "";

  let myTeamId: string | null = null;
  if (profileId && season) {
    const { data: captainRows } = await supabase
      .from("league_team_captains")
      .select("league_team_id")
      .eq("profile_id", profileId)
      .eq("season", season);
    const allowedTeamIds = new Set(teams.map((team) => team.id));
    myTeamId = (captainRows as { league_team_id: string }[] | null)?.find((row) => allowedTeamIds.has(row.league_team_id))?.league_team_id ?? null;
  }

  return { profileId, isAdmin, isOwner, teams, activeTeams, myTeamId, season };
}

/** What the match drafter already recorded about one of a fixture's games —
 *  the facts the report form would otherwise ask the captain to re-type. */
export interface DraftGameInfo {
  gameNumber: number;
  status: "drafting" | "complete";
  /** True once any pick/ban is locked — untouched rows (auto-created by a
   *  ready check) don't count as "in progress" for display. */
  started: boolean;
  /** The drafted blue side, resolved to a league_teams id (null when the
   *  name doesn't match — e.g. renamed teams). */
  blueTeamId: string | null;
  /** The recorded game winner, resolved to a league_teams id. */
  winnerTeamId: string | null;
}

/**
 * The fixture's match-draft rows, distilled for the captain page: per-game
 * draft status for the next-match card, and drafted blue sides + recorded
 * winners to prefill the report form. The drafter stores team NAMES (sides
 * swap between games; fixtures store free text), so both are resolved
 * against league_teams here, same convention as the fixture's own names.
 */
export async function fetchDraftGames(
  supabase: SupabaseClient,
  fixtureId: string,
  teams: LeagueTeam[],
): Promise<DraftGameInfo[]> {
  const { data, error } = await supabase
    .from("match_drafts")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("game_number");
  if (error) throw error;
  const rows = (data as {
    game_number: number;
    status: "drafting" | "complete";
    actions: unknown[] | null;
    blue_team_name: string | null;
    winner_team?: string | null;
  }[]) ?? [];
  return rows.map((row) => ({
    gameNumber: row.game_number,
    status: row.status,
    started: (row.actions ?? []).length > 0,
    blueTeamId: matchTeamId(teams, row.blue_team_name),
    winnerTeamId: matchTeamId(teams, row.winner_team ?? null),
  }));
}

/** Tourney codes for one fixture, ordered by game number. */
export async function fetchCodes(supabase: SupabaseClient, fixtureId: string): Promise<MatchCode[]> {
  const { data, error } = await supabase
    .from("match_codes")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("game_number");
  if (error) throw error;
  return (data as MatchCode[]) ?? [];
}

/** A captain's own reports (either side of the series) plus each report's games, newest first. */
export async function fetchMyReports(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
  leagueTeams: LeagueTeam[],
): Promise<MyReportRow[]> {
  const { data: reports, error } = await supabase
    .from("match_reports")
    .select("*")
    .eq("season", season)
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  const scope = createLeagueTeamScope(leagueTeams);
  const rows = ((reports as MatchReport[]) ?? [])
    .filter((report) => scope.includesTeamPair(report.team_a_id, report.team_b_id));
  if (rows.length === 0) return [];

  const { data: games, error: gamesError } = await supabase
    .from("match_report_games")
    .select("*")
    .in("report_id", rows.map((r) => r.id))
    .order("game_number");
  if (gamesError) throw gamesError;

  const byReport = new Map<string, MatchReportGame[]>();
  for (const g of (games as MatchReportGame[]) ?? []) {
    const list = byReport.get(g.report_id) ?? [];
    list.push(g);
    byReport.set(g.report_id, list);
  }
  return rows.map((r) => ({ ...r, games: byReport.get(r.id) ?? [] }));
}

/**
 * The team's featured-draft roster (matched by name, same convention as
 * `sync_league_team_captains`) plus the Riot IDs on record for this team
 * this season (`roster_memberships` -> `riot_accounts`). Both halves are
 * read-only here; the admin roster editor remains the only writer.
 */
export async function fetchMyRoster(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
  league: "premier" | "academy" = "premier",
): Promise<MyRosterData> {
  const { data: teamRow, error: teamError } = await supabase
    .from("league_teams")
    .select("name")
    .eq("id", teamId)
    .single();
  if (teamError) throw teamError;
  const teamName = (teamRow as { name: string } | null)?.name ?? null;

  let draftPlayers: Player[] = [];
  if (teamName) {
    const { data: settings, error: settingsError } = await supabase
      .from("league_settings")
      .select("featured_draft_id, academy_draft_id")
      .eq("id", 1)
      .single();
    if (settingsError) throw settingsError;
    const settingRows = (settings as { featured_draft_id: string | null; academy_draft_id?: string | null } | null) ?? null;
    const draftIds = [settingRows?.featured_draft_id, settingRows?.academy_draft_id].filter(
      (id): id is string => Boolean(id),
    );
    const draftTeamsResult = draftIds.length
      ? await supabase.from("teams").select("id, name").in("draft_id", draftIds)
      : { data: [], error: null };
    if (draftTeamsResult.error) throw draftTeamsResult.error;
    const { data: draftTeams } = draftTeamsResult;
    const draftTeamId = findDraftTeamId(teamName, (draftTeams as { id: string; name: string }[] | null) ?? []);

    if (draftTeamId) {
      const [playersResult, canonicalResult] = await Promise.all([
        supabase
          .from("players")
          .select("*")
          .eq("team_id", draftTeamId)
          .order("role"),
        supabase
          .from("player_pool")
          .select("id, display_name, rank, opgg_url")
          .eq("season_key", league === "academy" ? "academy-1" : "season-5"),
      ]);
      const { data: playerRows, error: playersError } = playersResult;
      if (playersError) throw playersError;
      if (canonicalResult.error) throw canonicalResult.error;
      const canonicalPlayers =
        (canonicalResult.data as { id: string; display_name: string; rank: string | null; opgg_url: string | null }[]) ?? [];
      draftPlayers = ((playerRows as Player[]) ?? []).map((player) => ({
        ...player,
        opgg_url:
          resolvePlayerOpggUrl(player, canonicalPlayers) ??
          (league === "academy" ? academyOpggUrlForPlayer(player.display_name) : null),
      }));
    }
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("roster_memberships")
    .select("id, riot_accounts(id, game_name, tag_line, display_name)")
    .eq("league_team_id", teamId)
    .eq("season", season);
  if (membershipsError) throw membershipsError;

  const riotAccounts = (
    (memberships as { id: string; riot_accounts: RiotAccount | RiotAccount[] | null }[] | null) ?? []
  )
    .map((m) => {
      const account = Array.isArray(m.riot_accounts) ? m.riot_accounts[0] : m.riot_accounts;
      return account ? { ...account, membershipId: m.id } : null;
    })
    .filter((a): a is RiotAccount & { membershipId: string } => a !== null);

  return { draftPlayers, riotAccounts };
}

/**
 * The team's ingested games (`stats_game_log`, matched on team name — the
 * canonical stats identity, per raw_stats.team_name) and their players'
 * `stats_player_agg` lines. "Their players" is derived from `raw_stats`
 * itself (distinct summoner_name/tag for this team_name + season) rather
 * than `roster_memberships`, which is intentionally allowed to be
 * incomplete — real ingested history is the more reliable source here.
 */
export async function fetchMyResults(
  supabase: SupabaseClient,
  teamName: string,
  season: string
): Promise<MyResultsData> {
  const [gameLogResult, rosterResult, playerAggResult] = await Promise.all([
    supabase.from("stats_game_log").select("*").eq("season", season),
    supabase.from("raw_stats").select("summoner_name, tag").eq("team_name", teamName).eq("season", season),
    supabase.from("stats_player_agg").select("*").eq("season", season),
  ]);
  if (gameLogResult.error) throw gameLogResult.error;
  if (rosterResult.error) throw rosterResult.error;
  if (playerAggResult.error) throw playerAggResult.error;

  const games = ((gameLogResult.data as GameLogRow[]) ?? [])
    .filter((g) => g.blue_team === teamName || g.red_team === teamName)
    .sort((a, b) => (b.game_date ?? "").localeCompare(a.game_date ?? ""));

  const rosterKeys = new Set(
    ((rosterResult.data as { summoner_name: string; tag: string }[]) ?? []).map(
      (r) => rosterKey(r.summoner_name, r.tag)
    )
  );
  const players = ((playerAggResult.data as PlayerAggRow[]) ?? []).filter((p) =>
    rosterKeys.has(rosterKey(p.summoner_name, p.tag))
  );

  return { games, players };
}

/** Announcements, pinned first then newest. */
export async function fetchAnnouncements(supabase: SupabaseClient): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Announcement[]) ?? [];
}

/**
 * Sets which team was on blue for a `needs_side` game and re-queues it as
 * `pending`. Returns `{ ok: true }` on success; on failure, the raw Supabase
 * error for the caller to render, or `error: null` for an RLS denial. An RLS
 * denial on UPDATE isn't an error -- the row just doesn't match the policy's
 * USING clause (e.g. the report was ingested in the interim), so PostgREST
 * reports success with zero rows affected. Without the `.select()` below
 * that would silently look like it worked until refresh. Treat "we asked
 * for the row back and got none" as a denial so callers can surface a
 * friendly message instead of a silent no-op.
 */
export async function fixGameSide(
  supabase: SupabaseClient,
  gameId: string,
  blueTeamId: string
): Promise<{ ok: true } | { ok: false; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from("match_report_games")
    .update({ blue_team_id: blueTeamId, status: "pending" })
    .eq("id", gameId)
    .select();
  if (error) return { ok: false, error };
  if (!data || data.length === 0) return { ok: false, error: null };
  return { ok: true };
}

/**
 * Inserts a report then its games. If the games insert fails (e.g. a
 * duplicate match_id trips the unique index), the just-inserted report is
 * deleted so no orphan queue entry survives — see the brief. `submitted_by`
 * is always set to the caller's own id so the "submitter may delete their
 * own pending report" RLS policy stays reachable.
 */
export async function submitReport(
  supabase: SupabaseClient,
  input: SubmitReportInput
): Promise<{ reportId: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const submittedBy = userData.user?.id ?? null;

  const { data: report, error: reportError } = await supabase
    .from("match_reports")
    .insert({
      season: input.season,
      season_phase: input.phase,
      team_a_id: input.teamAId,
      team_b_id: input.teamBId,
      score_a: input.scoreA,
      score_b: input.scoreB,
      draft_url: input.draftUrl,
      fixture_id: input.fixtureId,
      submitted_by: submittedBy,
    })
    .select("id")
    .single();
  if (reportError) throw reportError;
  const reportId = (report as { id: string }).id;

  const gamesPayload = input.games.map((g) => ({
    report_id: reportId,
    game_number: g.gameNumber,
    match_id: g.matchId,
    blue_team_id: g.blueTeamId,
  }));

  const { error: gamesError } = await supabase.from("match_report_games").insert(gamesPayload);
  if (gamesError) {
    await supabase.from("match_reports").delete().eq("id", reportId);
    throw gamesError;
  }

  return { reportId };
}
