// Row shapes for the match-reporting tables. Field names and nullability
// mirror the migrations' column lists exactly — see:
// - league_settings: supabase/migrations/20260811000005_league_settings_season.sql
//   (base columns id/featured_draft_id/updated_at from 20260810000001_teams_featured.sql)
// - league_teams / riot_accounts / roster_memberships:
//   supabase/migrations/20260811100001_league_config.sql
// - match_reports / match_report_games:
//   supabase/migrations/20260811100002_match_reports.sql (fixture_id added by
//   that same migration's "MERGE AMENDMENT" — see its header comment)
// Confirmed against live schema via `psql \d` before writing this file. Do
// not rename fields here without updating the tables.
//
// .superpowers/sdd/2026-08-11-match-reporting-auto-ingest/task-3-brief.md

/** `match_reports.status` check constraint. `forfeit` is the terminal state
 *  of a series nobody played — see 20260909000001_match_report_forfeit.sql.
 *  It is deliberately not `ingested`: nothing was verified, because there was
 *  nothing to verify. A series that WAS played and then conceded ingests
 *  normally and carries `forfeit_team_id` instead. */
export type ReportStatus = "pending" | "ingested" | "needs_sides" | "failed" | "forfeit";

/** `match_report_games.status` check constraint (singular "side", not "sides"). */
export type GameStatus = "pending" | "ingested" | "needs_side" | "failed";

/** Single admin-editable settings row (`id` is always 1). */
export interface LeagueSettings {
  id: number;
  featured_draft_id: string | null;
  updated_at: string;
  current_season: string;
  current_phase: string;
}

/** The canonical team list for reporting — decoupled from the per-draft `teams` table. */
export interface LeagueTeam {
  id: string;
  name: string;
  abbreviation: string;
  active: boolean;
}

/** A Riot account (summoner) captains report games with. */
export interface RiotAccount {
  id: string;
  game_name: string;
  tag_line: string;
  display_name: string | null;
}

/** Which `league_teams` a `riot_accounts` row played for in a given season. */
export interface RosterMembership {
  id: string;
  riot_account_id: string;
  season: string;
  league_team_id: string;
}

/** A reported series between two `league_teams`. */
export interface MatchReport {
  id: string;
  season: string;
  season_phase: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number;
  score_b: number;
  draft_url: string | null;
  submitted_by: string | null;
  submitted_at: string;
  status: ReportStatus;
  error_text: string | null;
  warning_text: string | null;
  ingested_at: string | null;
  fixture_id: string | null;
  /** Which side conceded, when the series did not go the distance. Null for
   *  an ordinary series. The games that WERE played are still reported and
   *  still ingest — a forfeit removes the games nobody played, not the ones
   *  they did. */
  forfeit_team_id: string | null;
  /** Human reason ("no show", "roster ineligible"), shown to staff. */
  forfeit_note: string | null;
}

/** One game within a `match_reports` series. */
export interface MatchReportGame {
  id: string;
  report_id: string;
  game_number: number;
  match_id: string;
  blue_team_id: string | null;
  resolved_blue_team_id: string | null;
  status: GameStatus;
  error_text: string | null;
}
