// What "today" means to a daily game.
//
// The product had two calendars. The Daily Rip, expeditions and their
// briefs all roll over at Eastern midnight (open_daily_pack and
// launch_expedition both compute `(now() at time zone 'America/New_York')`),
// while FPL'dle, Higher or Lower and Guess the Card rolled over at UTC
// midnight — which is 8pm Eastern, in the middle of the evening people
// actually play in. A member who opened the site at 9pm got yesterday's
// rip and tomorrow's puzzle, and no explanation of either was possible.
//
// One calendar, defined once. Every daily game asks this function and
// nothing computes a day of its own.

import { easternDateOf } from "@/lib/packs/week";

const ET_OFFSET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "longOffset",
});

/**
 * The Eastern date a daily game's puzzle and reward belong to.
 *
 * Takes an optional instant so tests can name a moment rather than
 * mocking the clock.
 */
export function dailyGameDate(now: Date = new Date()): string {
  return easternDateOf(now);
}

function easternOffsetAt(date: Date): string {
  const offset = ET_OFFSET.formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
  if (!offset) throw new Error("Could not determine the Eastern timezone offset.");
  return offset === "GMT" ? "+00:00" : offset.replace(/^GMT/, "");
}

/**
 * The instant when a daily game's Eastern calendar date ends.
 *
 * The puzzle date is a date-only value, so calculate the following date at
 * UTC noon first, then resolve its Eastern midnight with the offset in force
 * at that instant. The second offset lookup keeps the result correct across
 * DST boundaries without relying on the machine's local timezone.
 */
export function dailyGameResetAt(puzzleDate: string): string {
  const nextDate = new Date(`${puzzleDate}T12:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextDateString = nextDate.toISOString().slice(0, 10);
  const utcGuess = new Date(`${nextDateString}T00:00:00.000Z`);
  let resetAt = new Date(`${nextDateString}T00:00:00.000${easternOffsetAt(utcGuess)}`);
  const offsetAtReset = easternOffsetAt(resetAt);
  if (offsetAtReset !== easternOffsetAt(utcGuess)) {
    resetAt = new Date(`${nextDateString}T00:00:00.000${offsetAtReset}`);
  }
  return resetAt.toISOString();
}
