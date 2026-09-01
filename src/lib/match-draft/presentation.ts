import { draftDisplayOrder, actionForStep, normalizeChampionName } from "./rules";
import type {
  DraftSide,
  MatchDraftAction,
  MatchDraftPositions,
  MatchDraftState,
  MatchDraftStatus,
} from "./types";

export type DraftMatchupSlotState = "recorded" | "skipped" | "missing";

export interface DraftMatchupTeamView {
  name: string;
  abbreviation: string;
  imageUrl: string | null;
  players: string[];
}

export interface DraftMatchupPickView {
  side: DraftSide;
  slot: number;
  pickNumber: number | null;
  stepIndex: number | null;
  champion: string | null;
  playerName: string | null;
  role: string | null;
  state: DraftMatchupSlotState;
}

export interface DraftMatchupBanView {
  side: DraftSide;
  slot: number;
  stepIndex: number | null;
  champion: string | null;
  state: DraftMatchupSlotState;
}

export interface DraftMatchupSideView {
  side: DraftSide;
  team: DraftMatchupTeamView;
  picks: DraftMatchupPickView[];
  bans: DraftMatchupBanView[];
}

export interface DraftMatchupMetadata {
  status: MatchDraftStatus | null;
  scheduledAt: string | null;
  stageLabel: string | null;
  bestOf: number | null;
  score: string | null;
  /** Optional center-rail note, used by scouting to identify the sampled side. */
  railNote: string | null;
}

export interface DraftMatchupOutcome {
  winnerTeam: string | null;
  winnerSide: DraftSide | null;
  status: "winner" | "unresolved";
}

export interface DraftMatchupLiveState {
  currentStepIndex: number;
  turnStartedAt: string | null;
  secondsLeft: number | null;
  clockRunning: boolean;
  blueReady: boolean;
  redReady: boolean;
}

export interface DraftMatchupView {
  gameNumber: number;
  blue: DraftMatchupSideView;
  red: DraftMatchupSideView;
  metadata: DraftMatchupMetadata;
  outcome: DraftMatchupOutcome;
  live?: DraftMatchupLiveState;
}

export interface DraftMatchupTeamInput {
  name?: string | null;
  abbreviation?: string | null;
  imageUrl?: string | null;
  players?: string[];
}

export interface DraftMatchupInput {
  gameNumber: number;
  blueTeam?: DraftMatchupTeamInput;
  redTeam?: DraftMatchupTeamInput;
  actions: MatchDraftAction[];
  positions?: MatchDraftPositions | null;
  winnerTeam?: string | null;
  metadata?: Partial<DraftMatchupMetadata>;
  live?: DraftMatchupLiveState;
}

const ROLE_LABELS = ["Top", "Jungle", "Mid", "ADC", "Support"] as const;

function abbreviationFor(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/gi, ""))
    .filter(Boolean);
  return (words.length >= 3 ? words.map((word) => word[0]).join("") : words[0]?.slice(0, 3) ?? name.replace(/[^a-z0-9]/gi, "").slice(0, 3))
    .toUpperCase()
    .slice(0, 3) || "TBD";
}

function teamView(input: DraftMatchupTeamInput | undefined): DraftMatchupTeamView {
  const name = input?.name?.trim() || "TBD";
  return {
    name,
    abbreviation: input?.abbreviation?.trim() || abbreviationFor(name),
    imageUrl: input?.imageUrl?.trim() || null,
    players: input?.players ?? [],
  };
}

function actionState(action: MatchDraftAction | null): DraftMatchupSlotState {
  if (!action) return "missing";
  return action.skipped || !action.champion?.trim() ? "skipped" : "recorded";
}

function championValue(action: MatchDraftAction | null): string | null {
  return action?.champion?.trim() || null;
}

function actionStepIndex(actions: MatchDraftAction[], side: DraftSide, action: MatchDraftAction | null): number | null {
  if (!action) return null;
  if (typeof action.stepIndex === "number") return action.stepIndex;
  return draftDisplayOrder(side, action.kind).find((step) => actionForStep(actions, step) === action)?.index ?? null;
}

function actionForChampion(
  actions: MatchDraftAction[],
  side: DraftSide,
  champion: string,
  used: Set<MatchDraftAction>,
): MatchDraftAction | null {
  const key = normalizeChampionName(champion);
  const action = draftDisplayOrder(side, "pick")
    .map((step) => actionForStep(actions, step))
    .find((candidate) => candidate && !used.has(candidate) && candidate.champion && normalizeChampionName(candidate.champion) === key);
  if (action) used.add(action);
  return action ?? null;
}

function picksForSide(
  actions: MatchDraftAction[],
  positions: (string | null)[] | undefined,
  side: DraftSide,
  team: DraftMatchupTeamView,
): DraftMatchupPickView[] {
  const steps = draftDisplayOrder(side, "pick");
  const used = new Set<MatchDraftAction>();
  const skipped = steps
    .map((step) => actionForStep(actions, step))
    .filter((action): action is MatchDraftAction => Boolean(action && actionState(action) === "skipped"));

  if (positions?.length === ROLE_LABELS.length) {
    return positions.map((champion, index) => {
      const action = champion ? actionForChampion(actions, side, champion, used) : skipped.shift() ?? null;
      return {
        side,
        slot: index + 1,
        pickNumber: action?.slot ?? null,
        stepIndex: actionStepIndex(actions, side, action),
        champion: champion?.trim() || championValue(action),
        playerName: team.players[index] ?? action?.playerName ?? null,
        role: ROLE_LABELS[index],
        state: actionState(action),
      };
    });
  }

  return steps.map((step) => {
    const action = actionForStep(actions, step);
    return {
      side,
      slot: step.slot,
      pickNumber: action?.slot ?? step.slot,
      stepIndex: step.index,
      champion: championValue(action),
      playerName: action?.playerName ?? team.players[step.slot - 1] ?? null,
      role: null,
      state: actionState(action),
    };
  });
}

function bansForSide(actions: MatchDraftAction[], side: DraftSide): DraftMatchupBanView[] {
  return draftDisplayOrder(side, "ban").map((step) => {
    const action = actionForStep(actions, step);
    return {
      side,
      slot: step.slot,
      stepIndex: step.index,
      champion: championValue(action),
      state: actionState(action),
    };
  });
}

function sameTeam(left: string | null, right: string): boolean {
  return Boolean(left && normalizeChampionName(left) === normalizeChampionName(right));
}

export function createDraftMatchupView(input: DraftMatchupInput): DraftMatchupView {
  const blueTeam = teamView(input.blueTeam);
  const redTeam = teamView(input.redTeam);
  const winnerTeam = input.winnerTeam?.trim() || null;
  const winnerSide = winnerTeam
    ? sameTeam(winnerTeam, blueTeam.name)
      ? "blue"
      : sameTeam(winnerTeam, redTeam.name)
        ? "red"
        : null
    : null;

  return {
    gameNumber: input.gameNumber,
    blue: { side: "blue", team: blueTeam, picks: picksForSide(input.actions, input.positions?.blue, "blue", blueTeam), bans: bansForSide(input.actions, "blue") },
    red: { side: "red", team: redTeam, picks: picksForSide(input.actions, input.positions?.red, "red", redTeam), bans: bansForSide(input.actions, "red") },
    metadata: {
      status: input.metadata?.status ?? null,
      scheduledAt: input.metadata?.scheduledAt ?? null,
      stageLabel: input.metadata?.stageLabel ?? null,
      bestOf: input.metadata?.bestOf ?? null,
      score: input.metadata?.score ?? null,
      railNote: input.metadata?.railNote ?? null,
    },
    outcome: { winnerTeam, winnerSide, status: winnerTeam ? "winner" : "unresolved" },
    live: input.live,
  };
}

export function draftMatchupViewFromState(
  state: MatchDraftState,
  live?: Partial<DraftMatchupLiveState>,
): DraftMatchupView {
  return createDraftMatchupView({
    gameNumber: state.gameNumber,
    blueTeam: state.blueTeam,
    redTeam: state.redTeam,
    actions: state.actions,
    positions: state.positions,
    winnerTeam: state.winnerTeam,
    metadata: { status: state.status },
    live: {
      currentStepIndex: state.currentStepIndex,
      turnStartedAt: state.turnStartedAt,
      secondsLeft: live?.secondsLeft ?? null,
      clockRunning: live?.clockRunning ?? false,
      blueReady: live?.blueReady ?? state.blueReady,
      redReady: live?.redReady ?? state.redReady,
    },
  });
}
