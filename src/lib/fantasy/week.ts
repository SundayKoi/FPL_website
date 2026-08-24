// Which fantasy week a moment in time belongs to.
//
// Fantasy weeks ride the same Monday-start EASTERN grid as pack editions
// (see src/lib/packs/week.ts's header) — but unlike an edition, a fantasy
// week has a deadline inside it: lineups for week W lock at Monday
// LOCK_HOUR_ET Eastern and the games that score them are played after
// that. So there are two different "current weeks" and they must not be
// confused:
//
//   currentFantasyWeek  — the week you can still edit a lineup for
//   lastCompletedWeek   — the most recent week that has locked, i.e. the one
//                         the leaderboard is about
//
// Pure: every function takes the clock as an argument so tests (and a
// scoring job running at an odd hour) never depend on ambient time.

import { mondayOf } from "@/lib/packs/week";
import { LOCK_HOUR_ET } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Eastern UTC-offset in hours (-4 under EDT, -5 under EST) at a given
 *  instant, read from Intl so the DST calendar is never hand-rolled. */
function etOffsetHours(instant: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-]\d+)/.exec(name);
  return match ? Number(match[1]) : -5;
}

/**
 * The instant `weekStart`'s lineups freeze — Monday LOCK_HOUR_ET, EASTERN.
 * The ET offset is probed at that Monday's noon, so the lock lands at the
 * same wall-clock hour in New York whether the week runs on EDT or EST
 * (22:00 or 23:00 UTC respectively).
 */
export function lockTimeOf(weekStart: string): Date {
  const [year, month, day] = weekStart.split("-").map(Number);
  const offset = etOffsetHours(new Date(Date.UTC(year, month - 1, day, 12)));
  return new Date(Date.UTC(year, month - 1, day, LOCK_HOUR_ET - offset, 0, 0));
}

/** Has `weekStart`'s deadline passed? Exactly at the lock counts as locked —
 *  the deadline is the first moment you can no longer submit. */
export function isLocked(weekStart: string, now: Date): boolean {
  return now.getTime() >= lockTimeOf(weekStart).getTime();
}

/**
 * The Monday whose lineup is currently EDITABLE.
 *
 * This week's Monday right up to its lock, then next Monday's — so the
 * builder never shows a week the user can't submit for, and the hours
 * between Monday's lock and the games rolls straight over to the next week
 * rather than presenting a dead form.
 */
export function currentFantasyWeek(now: Date): string {
  const thisWeek = mondayOf(now);
  if (!isLocked(thisWeek, now)) return thisWeek;
  return mondayOf(new Date(new Date(`${thisWeek}T12:00:00.000Z`).getTime() + 7 * DAY_MS));
}

/**
 * The most recent Monday whose lock has passed — the week the leaderboard
 * and the scoring job are about. Always exactly one week behind
 * `currentFantasyWeek`, so the pair never points at the same Monday.
 */
export function lastCompletedWeek(now: Date): string {
  const thisWeek = mondayOf(now);
  if (isLocked(thisWeek, now)) return thisWeek;
  return mondayOf(new Date(new Date(`${thisWeek}T12:00:00.000Z`).getTime() - 7 * DAY_MS));
}
