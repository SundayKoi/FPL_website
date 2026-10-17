// When a week drafts and plays. Staff enter both in Eastern Time, as for the
// league's drafts (lib/draft/schedule), and the site shows them the same way.

import type { OffseasonWeek } from "./types";

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/** "Sun, Oct 18, 8:00 PM EDT". */
export function formatWeekTime(iso: string): string {
  return formatter.format(new Date(iso));
}

export type WeekMoment = { kind: "draft" | "games"; weekNumber: number; at: string };

/** What the week does next after `now`: its draft, else its games; null once both have passed or neither is set. */
export function nextWeekMoment(
  week: Pick<OffseasonWeek, "week_number" | "draft_at" | "games_at">,
  now: number = Date.now(),
): WeekMoment | null {
  if (week.draft_at && Date.parse(week.draft_at) > now) return { kind: "draft", weekNumber: week.week_number, at: week.draft_at };
  if (week.games_at && Date.parse(week.games_at) > now) return { kind: "games", weekNumber: week.week_number, at: week.games_at };
  return null;
}
