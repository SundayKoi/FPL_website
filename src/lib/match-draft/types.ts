import type { TeamIdentity } from "@/lib/teams/identity";

export type DraftSide = "blue" | "red";
export type DraftActionKind = "pick" | "ban";
export type MatchDraftStatus = "drafting" | "complete";
export type MatchDraftLayout = "stage" | "board";
export type MatchDraftImageSize = "xs" | "sm" | "md" | "lg";

export interface MatchDraftTeam extends TeamIdentity {
  players: string[];
}

export interface DraftStep {
  index: number;
  side: DraftSide;
  kind: DraftActionKind;
  slot: number;
  seconds: number;
}

export interface MatchDraftAction {
  stepIndex?: number;
  side?: DraftSide;
  kind: DraftActionKind;
  slot?: number;
  champion: string;
  playerName?: string | null;
}

export interface MatchDraftRow {
  id: string;
  fixture_id: string;
  game_number: number;
  status: MatchDraftStatus;
  layout: MatchDraftLayout;
  current_step_index: number;
  turn_started_at: string | null;
  blue_team_name: string | null;
  red_team_name: string | null;
  blue_ready: boolean;
  red_ready: boolean;
  actions: MatchDraftAction[];
  created_at: string;
  updated_at: string;
}

export interface MatchDraftState {
  fixtureId: string;
  gameNumber: number;
  status: MatchDraftStatus;
  layout: MatchDraftLayout;
  currentStepIndex: number;
  turnStartedAt: string | null;
  blueTeam: MatchDraftTeam;
  redTeam: MatchDraftTeam;
  scheduledTeams: [MatchDraftTeam, MatchDraftTeam];
  canChooseSides: boolean;
  sideChoiceRequired: boolean;
  /** Ready check — the pick/ban countdown only starts once both are true. */
  blueReady: boolean;
  redReady: boolean;
  actions: MatchDraftAction[];
  blockedChampions: string[];
}

export interface MatchDraftLink {
  gameNumber: number;
  href: string;
  label: string;
}

export type MatchDraftBestOf = 1 | 3 | 5;

/** The series' drafter format, chosen by captains/admins per fixture and
 *  stored in match_draft_settings; absent rows fall back to code defaults. */
export interface MatchDraftSeriesFormat {
  bestOf: MatchDraftBestOf;
  /** Fearless: champions picked in earlier games are blocked in later ones. */
  fearless: boolean;
}

export interface MatchDraftSettingsRow {
  fixture_id: string;
  best_of: number;
  fearless: boolean;
}

/** One game tab in the drafter header — the whole series shares one URL and
 *  these switch the ?game= param. */
export interface MatchDraftGameTab {
  gameNumber: number;
  href: string;
  /** null = no draft row yet for that game. */
  status: MatchDraftStatus | null;
}
