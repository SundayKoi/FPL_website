"use server";

import {
  advanceHigherLowerRound,
  startHigherLowerRun,
  submitHigherLowerChoice,
} from "./server";
import type { HigherLowerLeague } from "./types";

/** Thin Next.js adapters; Higher or Lower validation and state transitions stay in the module. */
export async function startHigherLowerRunAction(league: HigherLowerLeague) {
  return startHigherLowerRun(league);
}

export async function submitHigherLowerChoiceAction(input: unknown) {
  return submitHigherLowerChoice(input);
}

export async function advanceHigherLowerRoundAction(input: unknown) {
  return advanceHigherLowerRound(input);
}
