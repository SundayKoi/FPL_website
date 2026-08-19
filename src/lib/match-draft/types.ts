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
  /** null on a skipped step (turn clock expired). */
  champion: string | null;
  /** True when the step was skipped rather than drafted. */
  skipped?: boolean;
  playerName?: string | null;
}

/** Post-draft role confirmation: each side's five champions in role order
 *  (top→support). Null entries mark skipped picks; an absent side means
 *  that team hasn't confirmed yet. */
export interface MatchDraftPositions {
  blue?: (string | null)[];
  red?: (string | null)[];
}

/** A captain's pending "let me redo this step" request — one at a time. */
export interface MatchDraftChangeRequest {
  stepIndex: number;
  side: DraftSide;
  champion?: string | null;
  requestedAt?: string;
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
  change_request: MatchDraftChangeRequest | null;
  positions: MatchDraftPositions | null;
  /** Public lobbies only: the winning TEAM's name once captains record it. */
  winner_team?: string | null;
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
  changeRequest: MatchDraftChangeRequest | null;
  positions: MatchDraftPositions | null;
  /** Public lobbies only: who won this game (team name), for series score. */
  winnerTeam?: string | null;
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

/** A public /drafter lobby session, scoped by the visitor's secret token.
 *  When set, the board talks to the open_draft_* RPCs and the open_drafts
 *  realtime stream instead of the fixture-based match_draft ones. */
export interface OpenDraftLobbyHandle {
  lobbyId: string;
  token: string;
}

/** What open_draft_lobby_info(p_token) returns — the lobby's public shape
 *  plus which team (if any) the token drafts for. Never includes tokens. */
export interface OpenDraftLobbyInfo {
  lobbyId: string;
  teamA: string;
  teamB: string;
  bestOf: number;
  fearless: boolean;
  createdAt?: string;
  /** Optional player names entered at creation (top→support order). */
  teamAPlayers?: string[];
  teamBPlayers?: string[];
  /** The team this token drafts for; null on the spectator link. */
  teamName: string | null;
}

/** An open_drafts row — the public-lobby twin of MatchDraftRow (keyed by
 *  lobby instead of fixture, and with no stored layout). */
export interface OpenDraftRow extends Omit<MatchDraftRow, "fixture_id" | "layout"> {
  lobby_id: string;
}

/** What create_open_draft_lobby returns — the three secret link tokens. */
export interface OpenDraftLobbyTokens {
  lobbyId: string;
  tokenA: string;
  tokenB: string;
  tokenSpectator: string;
}
