import type { DraftActionKind, DraftSide } from "./types";

export const DRAFT_TURN_SECONDS = 30;

export interface PendingOvertime {
  blue: number;
  red: number;
}

/** The allowance for a newly opened turn. Ban clocks never use pick debt. */
export function turnAllowanceSeconds(
  kind: DraftActionKind,
  side: DraftSide,
  pending: PendingOvertime,
): number {
  return kind === "pick" ? DRAFT_TURN_SECONDS - Math.max(0, pending[side]) : DRAFT_TURN_SECONDS;
}

/** Build the persisted deadline for a turn from its server/client start. */
export function turnDeadlineAt(
  startedAt: string,
  kind: DraftActionKind,
  side: DraftSide,
  pending: PendingOvertime,
): string {
  const start = Date.parse(startedAt);
  return new Date(start + turnAllowanceSeconds(kind, side, pending) * 1000).toISOString();
}

/** Signed display value: 0 at the deadline, then -1, -2, ... in overtime. */
export function signedSecondsRemaining(deadlineAt: string, now = Date.now()): number {
  return Math.ceil((Date.parse(deadlineAt) - now) / 1000);
}

/** Whole seconds charged when a pick is locked after its deadline. */
export function overtimeSecondsForDeadline(deadlineAt: string | null, now = Date.now()): number {
  if (!deadlineAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(deadlineAt)) / 1000));
}

