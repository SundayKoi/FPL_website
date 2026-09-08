// The one read behind the staff dashboard.
//
// Service client only, by construction: `analytics_overview` is granted to
// service_role alone (20261005000001), so this cannot be made to work from
// a browser even if it were imported there — and "server-only" stops it
// being imported there at all. The page's session check is what decides
// whether a person may see the answer.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsOverview } from "./overview";

/** Weeks of history the dashboard reads by default. Eight is two months —
 *  long enough to see a rate change land and short enough that the query
 *  stays a few hundred milliseconds. */
export const DEFAULT_WEEKS = 8;
export const MAX_WEEKS = 52;

export interface AnalyticsRead {
  data: AnalyticsOverview | null;
  /** Set when the function isn't there yet: the migration is written but
   *  hasn't been run against this database. The page says so plainly
   *  rather than rendering a dashboard of zeroes that looks like a dead
   *  league. */
  missing: boolean;
  error: string | null;
}

export function clampWeeks(raw: string | number | undefined | null): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1) return DEFAULT_WEEKS;
  return Math.min(MAX_WEEKS, value);
}

export async function fetchAnalyticsOverview(service: SupabaseClient, weeks = DEFAULT_WEEKS): Promise<AnalyticsRead> {
  const { data, error } = await service.rpc("analytics_overview", { p_weeks: clampWeeks(weeks) });
  if (error) {
    // 42883 / PGRST202: no such function. Everything else is a real fault
    // and is shown as one.
    const missing = error.code === "42883" || error.code === "PGRST202";
    if (!missing) console.error("analytics: overview read failed", { code: error.code, message: error.message });
    return { data: null, missing, error: missing ? null : error.message };
  }
  return { data: (data as AnalyticsOverview) ?? null, missing: false, error: null };
}
