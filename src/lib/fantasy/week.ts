// Which fantasy week a moment in time belongs to.
//
// Fantasy weeks ride the same Monday-start UTC grid as pack editions and the
// homepage awards (see src/lib/packs/week.ts's header) — but unlike an
// edition, a fantasy week has a deadline inside it: lineups for week W lock
// at Monday LOCK_HOUR_UTC and the games that score them are played after
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
import { LOCK_HOUR_UTC } from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant `weekStart`'s lineups freeze — Monday LOCK_HOUR_UTC, UTC. */
export function lockTimeOf(weekStart: string): Date {
  const lock = new Date(`${weekStart}T00:00:00.000Z`);
  lock.setUTCHours(LOCK_HOUR_UTC, 0, 0, 0);
  return lock;
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
  return mondayOf(new Date(new Date(`${thisWeek}T00:00:00.000Z`).getTime() + 7 * DAY_MS));
}

/**
 * The most recent Monday whose lock has passed — the week the leaderboard
 * and the scoring job are about. Always exactly one week behind
 * `currentFantasyWeek`, so the pair never points at the same Monday.
 */
export function lastCompletedWeek(now: Date): string {
  const thisWeek = mondayOf(now);
  if (isLocked(thisWeek, now)) return thisWeek;
  return mondayOf(new Date(new Date(`${thisWeek}T00:00:00.000Z`).getTime() - 7 * DAY_MS));
}
