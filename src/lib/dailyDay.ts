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

/**
 * The Eastern date a daily game's puzzle and reward belong to.
 *
 * Takes an optional instant so tests can name a moment rather than
 * mocking the clock.
 */
export function dailyGameDate(now: Date = new Date()): string {
  return easternDateOf(now);
}
