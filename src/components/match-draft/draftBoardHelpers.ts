import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import { turnAllowanceSeconds, turnDeadlineAt } from "@/lib/match-draft/timing";
import type { DraftSide, MatchDraftState } from "@/lib/match-draft/types";

/** Supabase/Postgrest errors are plain objects, not Error instances — pull a
 *  human message out of whatever was thrown, and translate the RLS rejection
 *  every non-captain visitor hits into plain language. */
export function saveErrorMessage(err: unknown, fallback: string): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof (err as { message?: unknown })?.message === "string"
        ? (err as { message: string }).message
        : "";
  if (!raw) return fallback;
  if (/row-level security|permission denied|violates row-level/i.test(raw)) {
    return "You don't have permission to draft this match — sign in as one of this fixture's captains or an admin.";
  }
  if (/JWT|token|not authenticated/i.test(raw)) {
    return "You're not signed in — log in as a captain or admin to draft.";
  }
  // RPC validation errors read "CODE: human message" — show just the message.
  if (/^[A-Z_]+:\s/.test(raw)) return raw.replace(/^[A-Z_]+:\s*/, "");
  return `${fallback} (${raw})`;
}

/** Team names compare trimmed and case-insensitively; a missing name never
 *  matches anything. */
export const sameTeam = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The team currently drafting on `side` of this game. */
export const teamOnSide = (state: MatchDraftState, side: DraftSide) => (side === "blue" ? state.blueTeam : state.redTeam);

/** Turn timing columns for the step that follows a commit: cleared when the
 *  draft is finished, otherwise that step's allowance from `startedAt`. */
export const timingForNextStep = (nextStepIndex: number | null, startedAt: string, pending: { blue: number; red: number }) => {
  if (nextStepIndex === null) {
    return { turnStartedAt: null, turnDeadlineAt: null, turnAllowanceSeconds: null };
  }
  const step = LCS_DRAFT_STEPS[nextStepIndex];
  const allowance = turnAllowanceSeconds(step.kind, step.side, pending);
  return {
    turnStartedAt: startedAt,
    turnDeadlineAt: turnDeadlineAt(startedAt, step.kind, step.side, pending),
    turnAllowanceSeconds: allowance,
  };
};
