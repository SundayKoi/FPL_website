"use server";

import { resetBoxScorePuzzle, submitBoxScoreGuess } from "./server";

/** Thin Next adapter; validation, authorization, and hidden-answer handling stay in the module. */
export async function submitBoxScoreGuessAction(input: unknown) {
  return submitBoxScoreGuess(input);
}

export async function resetBoxScorePuzzleAction(input: unknown) {
  return resetBoxScorePuzzle(input);
}
