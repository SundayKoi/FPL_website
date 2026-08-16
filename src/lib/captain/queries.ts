// Data layer for the private /captain page. Every fetcher takes a
// SupabaseClient (server or browser — both share the same interface, see
// src/lib/time.ts's fetchServerOffset for the existing precedent) so the
// same functions serve src/app/captain/page.tsx (createServerSupabase) and
// the client components that mutate after a user action
// (createClient) — see .superpowers/sdd/2026-08-11-match-reporting-auto-
// ingest/task-5-brief.md and docs/superpowers/specs/2026-08-11-captains-
// page-design.md.
//
// Row types for league_team_captains/match_codes/announcements live here
// rather than in a separate types file: the brief's Files list for this
// task does not include one, and these three tables (unlike Tasks 1-3's,
// which already had src/lib/matches/types.ts) have no existing TS shape to
// share. Field names/nullability mirror
// supabase/migrations/20260811100003_captain_page.sql exactly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueTeam, MatchReport, MatchReportGame, RiotAccount } from "@/lib/matches/types";
import type { Player } from "@/lib/draft/types";
import type { GameLogRow, PlayerAggRow } from "@/lib/stats/types";
import { draftSettingColumn, type League } from "@/lib/captain/league";

/** One row of `league_team_captains`. */
export interface LeagueTeamCaptain {
  id: string;
  league?: League;
  league_team_id: string;
  season: string;
  profile_id: string;
}

/** One row of `match_codes` — the one genuinely private table in the app. */
export interface MatchCode {
  id: string;
  league?: League;
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
  league?: League;
  title: string;
  body: string;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
}

/** Resolved server-side context for the signed-in visitor. */
export interface CaptainContext {
  league: League;
  academyConfigured: boolean;
  profileId: string | null;
  isAdmin: boolean;
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
  league: League;
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

/**
 * Teams offered in human-facing pickers. `league_teams` accumulates every name
 * the league has ever used (historical stats seasons plus each draft), so
 * admins retire old ones with `active = false`; resolution paths still use the
 * full list so historical names keep matching.
 */
export function activeOnly(teams: LeagueTeam[]): LeagueTeam[] {
  return teams.filter((t) => t.active !== false);
}

export async function fetchCaptainContext(supabase: SupabaseClient, league: League = "premier"): Promise<CaptainContext> {
  const { data: userData } = await supabase.auth.getUser();
  const profileId = userData.user?.id ?? null;

  const [profileResult, teamsResult, settingsResult] = await Promise.all([
    profileId
      ? supabase.from("profiles").select("is_admin").eq("id", profileId).single()
      : Promise.resolve({ data: null as { is_admin: boolean } | null }),
    supabase.from("league_teams").select("*").order("name"),
    supabase.from("league_settings").select(`current_season, ${draftSettingColumn(league)}`).eq("id", 1).single(),
  ]);

  const isAdmin = profileResult.data?.is_admin ?? false;
  const teams = (teamsResult.data as LeagueTeam[]) ?? [];
  const season = settingsResult.data?.current_season ?? "";
  const academyConfigured = league === "premier" || Boolean((settingsResult.data as Record<string, unknown> | null)?.academy_draft_id);

  let myTeamId: string | null = null;
  if (profileId && season) {
    const { data: captainRows } = await supabase
      .from("league_team_captains")
      .select("league_team_id")
      .eq("profile_id", profileId)
      .eq("season", season)
      .eq("league", league);
    myTeamId = (captainRows as { league_team_id: string }[] | null)?.[0]?.league_team_id ?? null;
  }

  const scopedTeams = teams.filter((team) => (team.league ?? "premier") === league);
  return { league, academyConfigured, profileId, isAdmin, teams: scopedTeams, activeTeams: activeOnly(scopedTeams), myTeamId, season };
}

/** Tourney codes for one fixture, ordered by game number. */
export async function fetchCodes(supabase: SupabaseClient, fixtureId: string, league: League = "premier"): Promise<MatchCode[]> {
  const { data, error } = await supabase
    .from("match_codes")
    .select("*")
    .eq("fixture_id", fixtureId)
    .eq("league", league)
    .order("game_number");
  if (error) throw error;
  return (data as MatchCode[]) ?? [];
}

/** A captain's own reports (either side of the series) plus each report's games, newest first. */
export async function fetchMyReports(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
  league: League = "premier"
): Promise<MyReportRow[]> {
  const { data: reports, error } = await supabase
    .from("match_reports")
    .select("*")
    .eq("season", season)
    .eq("league", league)
    .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  const rows = (reports as MatchReport[]) ?? [];
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
  league: League = "premier"
): Promise<MyRosterData> {
  const { data: teamRow } = await supabase.from("league_teams").select("name").eq("id", teamId).single();
  const teamName = (teamRow as { name: string } | null)?.name ?? null;

  let draftPlayers: Player[] = [];
  if (teamName) {
    const { data: settings } = await supabase
      .from("league_settings")
      .select(draftSettingColumn(league))
      .eq("id", 1)
      .single();
    const featuredDraftId = (settings as Record<string, string | null> | null)?.[draftSettingColumn(league)] ?? null;

    if (featuredDraftId) {
      const { data: draftTeams } = await supabase
        .from("teams")
        .select("id, name")
        .eq("draft_id", featuredDraftId);
      const normalized = teamName.trim().toLowerCase();
      const draftTeamId = ((draftTeams as { id: string; name: string }[] | null) ?? []).find(
        (t) => t.name.trim().toLowerCase() === normalized
      )?.id;

      if (draftTeamId) {
        const { data: playerRows, error: playersError } = await supabase
          .from("players")
          .select("*")
          .eq("team_id", draftTeamId)
          .order("role");
        if (playersError) throw playersError;
        draftPlayers = (playerRows as Player[]) ?? [];
      }
    }
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("roster_memberships")
    .select("id, riot_accounts(id, game_name, tag_line, display_name)")
    .eq("league_team_id", teamId)
    .eq("season", season)
    .eq("league", league);
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
  season: string,
  league: League = "premier"
): Promise<MyResultsData> {
  const [gameLogResult, rosterResult, playerAggResult] = await Promise.all([
    supabase.from("captain_stats_game_log").select("*").eq("season", season).eq("league", league),
    supabase.from("raw_stats").select("summoner_name, tag").eq("team_name", teamName).eq("season", season).eq("league", league),
    supabase.from("captain_stats_player_agg").select("*").eq("season", season).eq("league", league),
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
export async function fetchAnnouncements(supabase: SupabaseClient, league: League = "premier"): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("league", league)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Announcement[]) ?? [];
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
      league: input.league,
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
