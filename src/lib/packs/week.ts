// The week a card was printed in / a fantasy lineup belongs to.
//
// Monday-start weeks on the EASTERN (America/New_York) calendar. The league
// lives on US East time — matches are "Monday 8 PM ET" — so a pull at
// 9 PM ET on a Sunday must stamp the week that Sunday belongs to, not the
// UTC Monday that has already started in Greenwich. (That exact off-by-a-
// -week is why this stopped being UTC: Sunday-evening pulls were printing
// next week's edition.) The Monday DATE STRING the functions return is
// timezone-less — "2026-08-17" — so Postgres date columns, chips, and
// comparisons all round-trip unchanged.

const DAY_MS = 24 * 60 * 60 * 1000;

/** date parts + weekday as seen on the Eastern calendar, DST handled by
 *  Intl rather than by us. */
const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

const DAYS_SINCE_MONDAY: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * The Monday of the EASTERN-calendar week containing `date`, as a
 * `YYYY-MM-DD` string. Pure over its input: the instant is projected onto
 * the America/New_York calendar first, so the answer is the same whatever
 * machine or timezone runs it. The subtraction anchors at UTC noon of the
 * ET calendar date — whole-day steps from noon can't be dragged across a
 * date boundary by a DST hour.
 */
export function mondayOf(date: Date): string {
  const parts = ET_PARTS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const daysSinceMonday = DAYS_SINCE_MONDAY[get("weekday")] ?? 0;
  const monday = new Date(Date.UTC(year, month - 1, day, 12) - daysSinceMonday * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

/**
 * The Monday of the most recent COMPLETED Eastern week — one week behind
 * `mondayOf(now)`, which is the week still running.
 *
 * The Weekly Draw's week. It runs Tuesday morning, when this week's Monday
 * is a day old and only the week before it is a finished week of pulls; a
 * draw over the week in progress would raffle tickets people can still buy.
 *
 * Built by stepping back from the ET Monday's UTC noon, the same DST-proof
 * anchor mondayOf uses, then re-projecting — never by arithmetic on a
 * local-time Date, which would answer differently on a machine east of
 * Greenwich.
 */
export function lastCompletedWeekMonday(now: Date): string {
  const thisWeek = mondayOf(now);
  return mondayOf(new Date(new Date(`${thisWeek}T12:00:00.000Z`).getTime() - 7 * DAY_MS));
}

/**
 * An edition week as a chip label: "2026-08-17" → "WK Aug 17".
 *
 * The stored week is a plain calendar date, so it is read back as UTC
 * midnight and formatted as UTC — letting the browser's local timezone
 * parse it would slide a chunk of the world back a day and print the
 * wrong print run.
 */
export function editionLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return `WK ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/**
 * The Eastern calendar date containing `date`, as `YYYY-MM-DD`. Same
 * projection mondayOf uses, without the snap to Monday — the daily rip's
 * day boundary, matching open_daily_pack's
 * `(opened_at at time zone 'America/New_York')::date` exactly.
 */
export function easternDateOf(date: Date): string {
  const parts = ET_PARTS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
