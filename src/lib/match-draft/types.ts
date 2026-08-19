import type { TeamIdentity } from "@/lib/teams/identity";

export type DraftSide = "blue" | "red";
export type DraftActionKind = "pick" | "ban";
export type MatchDraftStatus = "drafting" | "complete";
export type MatchDraftLayout = "stage" | "board";

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
  blueTeam: TeamIdentity;
  redTeam: TeamIdentity;
  actions: MatchDraftAction[];
  blockedChampions: string[];
}

export interface MatchDraftLink {
  gameNumber: number;
  href: string;
  label: string;
}
