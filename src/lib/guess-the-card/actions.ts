"use server";

import { resetGuessTheCardPuzzle, submitGuessTheCard } from "./server";

/** Thin Next adapter; validation, authorization, and hidden-answer handling stay in the module. */
export async function submitGuessTheCardAction(input: unknown) {
  return submitGuessTheCard(input);
}

export async function resetGuessTheCardPuzzleAction(input: unknown) {
  return resetGuessTheCardPuzzle(input);
}
