// The week a card was printed in / a fantasy lineup belongs to.
//
// Monday-start UTC weeks, the same convention src/lib/home/awards.ts's
// weekFor uses for the homepage awards — the league plays on a weekly
// cadence and every other weekly surface on the site already lines up on
// Monday, so pack editions and fantasy weeks share that grid rather than
// inventing a second one.

/**
 * The UTC Monday of `date`, as a `YYYY-MM-DD` date string (the shape
 * Postgres `date` columns round-trip). Pure — no locale, no local timezone:
 * a pull at 23:00 in New York and one at 05:00 in Berlin the next morning
 * must land in the same edition for everyone.
 */
export function mondayOf(date: Date): string {
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const start = new Date(date.getTime());
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}
