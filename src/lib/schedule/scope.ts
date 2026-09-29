import { seasonBelongsToLeague } from "@/lib/league/season";
import type { FixtureRow } from "@/lib/schedule/types";

const ACADEMY_EXCLUDED_STAGES = new Set(["gauntlet_r1", "gauntlet_r2"]);

/** Apply the persistent season boundary before a route builds any public or admin data. */
export function scopeScheduleFixtures(rows: FixtureRow[], league: "premier" | "academy"): FixtureRow[] {
  return rows.filter(
    (row) =>
      seasonBelongsToLeague(row.season, league) &&
      !(league === "academy" && ACADEMY_EXCLUDED_STAGES.has(row.stage)),
  );
}
