// The purse: bank or push.
//
// Every cleared round adds to a purse that is real betting dollars. Between
// fights the player may BANK it — the run ends, the purse is paid — or push
// into the next round, where a loss takes the purse with it. It is the
// decision the mode was missing: not "which relic" but "do I risk what I
// have". Score is untouched by any of this; the board is still board
// points, and banking keeps the score already won exactly as walking away
// always did.
//
// Sized as a sink. With the measured curves (about 94% clear round 1, four
// in ten reach round 4, one run in twenty clears all eight for a player who
// reads the offers), no stopping rule returns the entry fee on average —
// purse.test.ts holds the schedule to that. What the purse buys is not
// income; it is a reason to stop at round 4 instead of dying at round 5.

import { GAUNTLET_ROUNDS } from "./sim";
import { ascensionPurseMult } from "./ascension";

/** What each cleared round adds, round 1 first. */
export const PURSE_STEPS: readonly number[] = [10, 10, 12, 16, 18, 22, 27, 35];

/** The purse after `cleared` rounds — cumulative, so banking after round
 *  four pays every step so far. */
export function purseAfter(cleared: number, ascension = 0): number {
  let total = 0;
  for (let round = 1; round <= Math.min(cleared, GAUNTLET_ROUNDS); round += 1) total += purseStep(round, ascension);
  return total;
}

/** What winning `round` adds to the purse — 10% more per ascension level,
 *  rounded per step so the running total on the row is always whole. */
export function purseStep(round: number, ascension = 0): number {
  const step = PURSE_STEPS[round - 1] ?? 0;
  return Math.round(step * ascensionPurseMult(ascension));
}

/** The purse a full clear pays. */
export const PURSE_MAX = purseAfter(GAUNTLET_ROUNDS);

/**
 * Whether a run may bank right now: live, and no fight in progress. Once
 * the first half has been played the purse is on the table until the
 * whistle — walking away mid-fight forfeits it.
 */
export function canBank(run: { status: string; crossroads: unknown }): boolean {
  return run.status === "active" && run.crossroads === null;
}
