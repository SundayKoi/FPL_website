"use server";

import { revealFpldleAnswer, submitFpldleGuess } from "./server";

/** Thin Next adapter; validation and hidden-answer handling stay in the module. */
export async function submitFpldleGuessAction(input: unknown) {
  return submitFpldleGuess(input);
}

export async function revealFpldleAnswerAction(input: unknown) {
  return revealFpldleAnswer(input);
}
