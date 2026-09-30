import type { MatchDraftLayout } from "./types";

// Query-string parsing shared by the fixture draft (/match-draft/[fixtureId])
// and the open lobby (/drafter/[token]).

/** ?game= as a game number within the series; anything else is game 1. */
export function draftGameParam(value: string | undefined, bestOf: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, bestOf);
}

/** Explicit ?layout= choice, or null to fall back to the page's
 *  viewer-based default (drafters get board, spectators get stage). */
export function draftLayoutParam(value: string | undefined): MatchDraftLayout | null {
  return value === "board" ? "board" : value === "stage" ? "stage" : null;
}
