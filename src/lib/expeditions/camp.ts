// Base camp: what a collector builds between runs. Pure, like config.ts.
//
// Only the slot ceiling lives here for now, because the guardrail in
// config.test.ts has to price a second scouting slot before the camp
// exists: a slot that sends more squads out a day is the one upgrade that
// touches runs-per-day, so its bound is held against MAXED_DAILY_STREAK
// from the start rather than after it ships.

/** Extra Scouting Runs a camp can put in the field at once. One: two
 *  scouts out together pay 465 a day at base rates, and with a
 *  Speedrunner's shorter clock 531 — under the streak. A second extra slot
 *  would not be. The camp table must check `slots` to the same bound. */
export const CAMP_SLOTS_MAX = 1;
