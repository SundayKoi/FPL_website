// Row shapes for the offseason tournament's tables — mirrors
// supabase/migrations/20261107000001_offseason_tournament.sql. The whole
// feature (this folder, src/app/offseason, src/components/offseason) is
// temporary: docs/offseason.md has the removal checklist.

import type { LolRole } from "@/lib/draft/types";

export type OffseasonEventStatus = "signups" | "running" | "finals" | "complete";
export type EntrantStatus = "active" | "benched" | "eliminated" | "withdrawn";
export type WeekStatus = "setup" | "drafting" | "playing" | "complete";
export type Tier = "main" | "elimination";
export type EntryTier = Tier | "bench";
export type MatchStage = "round_robin" | "elimination" | "semifinal" | "final";

/** Each team plays at most this many games in a week's round robin. */
export const MAX_ROUND_ROBIN_GAMES = 3;
/** The elimination tier starts once the round robin has rated everyone. */
export const ELIMINATION_START_WEEK = 3;
export const TEAM_SIZE = 5;

export interface OffseasonEvent {
  id: string;
  name: string;
  status: OffseasonEventStatus;
  signups_open: boolean;
  yardstick_season: string;
  created_at: string;
}

export interface OffseasonEntrant {
  id: string;
  event_id: string;
  profile_id: string | null;
  display_name: string;
  riot_id: string;
  opgg_url: string | null;
  current_rank: string | null;
  primary_role: LolRole;
  secondary_role: LolRole | null;
  assigned_role: LolRole | null;
  status: EntrantStatus;
  eliminated_week: number | null;
  signed_up_at: string;
}

export interface OffseasonWeek {
  id: string;
  event_id: string;
  week_number: number;
  status: WeekStatus;
  elimination_per_role: number;
  main_draft_id: string | null;
  elimination_draft_id: string | null;
  created_at: string;
}

export interface OffseasonWeekEntry {
  week_id: string;
  entrant_id: string;
  tier: EntryTier;
  captain_seat: number | null;
}

export interface OffseasonTeam {
  id: string;
  week_id: string;
  tier: Tier;
  name: string;
  captain_entrant_id: string | null;
  draft_team_id: string | null;
  eliminated: boolean;
}

export interface OffseasonTeamMember {
  team_id: string;
  entrant_id: string;
  role: LolRole;
  price: number | null;
}

export interface OffseasonMatch {
  id: string;
  week_id: string;
  stage: MatchStage;
  sort_order: number;
  team_a_id: string;
  team_b_id: string;
  best_of: 1 | 3 | 5;
  winner_team_id: string | null;
}

export interface OffseasonGame {
  id: string;
  match_id: string;
  game_number: number;
  riot_match_id: string | null;
  winner_team_id: string | null;
  ingested_at: string | null;
  ingest_error: string | null;
}

/** Everything the event's pages read, in one place. */
export interface OffseasonEventData {
  event: OffseasonEvent;
  entrants: OffseasonEntrant[];
  weeks: OffseasonWeek[];
  entries: OffseasonWeekEntry[];
  teams: OffseasonTeam[];
  members: OffseasonTeamMember[];
  matches: OffseasonMatch[];
  games: OffseasonGame[];
}

export const STAGE_LABELS: Record<MatchStage, string> = {
  round_robin: "Round robin",
  elimination: "Elimination",
  semifinal: "Semifinal",
  final: "Final",
};

export const STATUS_LABELS: Record<OffseasonEventStatus, string> = {
  signups: "Sign-ups",
  running: "In progress",
  finals: "Finals",
  complete: "Complete",
};

/** "Name#TAG" split for the card engine's player key; null if malformed. */
export function splitRiotId(riotId: string): { name: string; tag: string } | null {
  const at = riotId.lastIndexOf("#");
  if (at <= 0 || at === riotId.length - 1) return null;
  return { name: riotId.slice(0, at).trim(), tag: riotId.slice(at + 1).trim() };
}
