import type { MatchDraftRow, MatchDraftSeriesFormat, MatchDraftState } from "./types";

/** Keep row payload handling in one place so realtime events and catch-up
 * snapshots cannot disagree about what is authoritative. */
export function actionsFromDraftRow(row: MatchDraftRow): MatchDraftRow["actions"] {
  return (row.actions ?? []).filter((action) => Boolean(action && (action.champion || action.skipped)));
}

export function acceptsRevision(current: number | undefined, incoming: number | undefined): boolean {
  if (incoming === undefined || current === undefined) return true;
  return incoming >= current;
}

/** Apply persisted fields without replacing local layout/team presentation. */
export function stateFromDraftRow(current: MatchDraftState, row: MatchDraftRow): MatchDraftState | null {
  if (row.game_number !== current.gameNumber || !acceptsRevision(current.revision, row.revision)) return null;

  const actions = actionsFromDraftRow(row);
  const teamForName = (name: string | null, fallback: MatchDraftState["blueTeam"]) =>
    current.scheduledTeams.find((team) => team.name.trim().toLowerCase() === name?.trim().toLowerCase()) ?? fallback;
  const resetSides = current.gameNumber > 1 && actions.length === 0 && !row.blue_team_name && !row.red_team_name;
  const blueTeam = row.blue_team_name ? teamForName(row.blue_team_name, current.blueTeam) : resetSides ? current.scheduledTeams[0] : current.blueTeam;
  const redTeam = row.red_team_name ? teamForName(row.red_team_name, current.redTeam) : resetSides ? current.scheduledTeams[1] : current.redTeam;
  return {
    ...current,
    revision: row.revision ?? current.revision,
    status: row.status,
    currentStepIndex: row.current_step_index,
    turnStartedAt: row.turn_started_at,
    turnDeadlineAt: row.turn_deadline_at,
    turnAllowanceSeconds: row.turn_allowance_seconds,
    bluePendingOvertimeSeconds: row.blue_pending_overtime_seconds ?? 0,
    redPendingOvertimeSeconds: row.red_pending_overtime_seconds ?? 0,
    blueReady: row.blue_ready ?? false,
    redReady: row.red_ready ?? false,
    changeRequest: row.change_request ?? null,
    positions: row.positions ?? null,
    winnerTeam: row.winner_team ?? null,
    blueTeam,
    redTeam,
    actions,
    canChooseSides: current.gameNumber > 1 && actions.length === 0,
    sideChoiceRequired:
      current.gameNumber > 1 &&
      actions.length === 0 &&
      !(row.blue_team_name && row.red_team_name),
  };
}

/** A deleted row represents a reset, not a reason to navigate away. */
export function emptyDraftState(current: MatchDraftState): MatchDraftState {
  const [blueTeam, redTeam] = current.scheduledTeams;
  return {
    ...current,
    revision: undefined,
    status: "drafting",
    currentStepIndex: 0,
    turnStartedAt: null,
    turnDeadlineAt: null,
    turnAllowanceSeconds: null,
    bluePendingOvertimeSeconds: 0,
    redPendingOvertimeSeconds: 0,
    blueTeam,
    redTeam,
    canChooseSides: current.gameNumber > 1,
    sideChoiceRequired: current.gameNumber > 1,
    blueReady: false,
    redReady: false,
    changeRequest: null,
    positions: null,
    winnerTeam: null,
    actions: [],
  };
}

export function formatFromSettings(
  current: MatchDraftSeriesFormat,
  row: { best_of?: number; fearless?: boolean } | null | undefined,
): MatchDraftSeriesFormat {
  const bestOf = row?.best_of;
  return {
    bestOf: bestOf === 1 || bestOf === 5 ? bestOf : bestOf === 3 ? 3 : current.bestOf,
    fearless: row?.fearless ?? current.fearless,
  };
}

export function timeoutRetryable(error: unknown): boolean {
  const raw =
    typeof error === "string"
      ? error
      : typeof (error as { message?: unknown })?.message === "string"
        ? (error as { message: string }).message
        : "";
  return /TOO_SOON|network|fetch|timeout|timed out|temporar|connection|5\d\d/i.test(raw);
}

export function draftTurnKey(state: MatchDraftState): string {
  return [state.revision ?? 0, state.gameNumber, state.currentStepIndex, state.turnDeadlineAt ?? state.turnStartedAt ?? ""].join(":");
}
