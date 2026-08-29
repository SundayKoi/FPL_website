// Reads for the balance report. Service client only — both tape tables
// are deny-all, and the report is staff-gated at the page.
//
// Everything here pages. PostgREST answers a select over its `max_rows`
// ceiling by silently returning the first thousand rows, with no error and
// no marker, so an unpaged read of a busy season would produce a report
// that looks fine and is wrong. Paging needs a TOTAL order to be safe —
// `id` is unique and monotonic, so no row can repeat or be skipped between
// pages the way a tie on `created_at` would allow.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfferSample, RoundSample } from "./balance";

export const BALANCE_PAGE = 1000;
/** 25 pages is 25k rounds — several seasons of a league this size. Past
 *  that the report says so rather than quietly reading a slice. */
export const BALANCE_MAX_PAGES = 25;

export interface BalanceWindow {
  season?: string;
  /** Monday, inclusive — the report's usual shape is "the last N weeks". */
  sinceWeek?: string;
}

export interface BalanceTape {
  rounds: RoundSample[];
  offers: OfferSample[];
  /** True when a table hit the page ceiling: the report is reading a
   *  slice, and says so instead of pretending to be complete. */
  truncated: boolean;
  /** True when the tables aren't there yet (migration unapplied). */
  missing: boolean;
}

const ROUND_COLUMNS =
  "id, run_id, round, situation_key, choice_key, won, score, daring, relics, plan_key";
const OFFER_COLUMNS = "id, round, offered, taken";

async function readAll<T>(
  service: SupabaseClient,
  table: string,
  columns: string,
  window: BalanceWindow,
): Promise<{ rows: T[]; truncated: boolean; missing: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < BALANCE_MAX_PAGES; page += 1) {
    // Filters BEFORE order/range: .range() hands back a transform builder
    // that has no .in()/.eq(), so a filter added after it throws.
    let query = service.from(table).select(columns);
    if (window.season) query = query.eq("season", window.season);
    if (window.sinceWeek) query = query.gte("week_start", window.sinceWeek);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(page * BALANCE_PAGE, page * BALANCE_PAGE + BALANCE_PAGE - 1);
    if (error) {
      // 42P01 / PGRST205: the tape doesn't exist yet. An empty report is
      // the honest answer, not a crash on a staff page.
      return { rows, truncated: false, missing: rows.length === 0 };
    }
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < BALANCE_PAGE) return { rows, truncated: false, missing: false };
  }
  return { rows, truncated: true, missing: false };
}

/** The whole tape for a window, paged. */
export async function fetchBalanceTape(
  service: SupabaseClient,
  window: BalanceWindow = {},
): Promise<BalanceTape> {
  const [rounds, offers] = await Promise.all([
    readAll<RoundSample>(service, "gauntlet_round_log", ROUND_COLUMNS, window),
    readAll<OfferSample>(service, "gauntlet_relic_offers", OFFER_COLUMNS, window),
  ]);
  return {
    rounds: rounds.rows,
    offers: offers.rows,
    truncated: rounds.truncated || offers.truncated,
    missing: rounds.missing && offers.missing,
  };
}

/** The Monday `weeks` weeks before the given Monday, as the window's
 *  floor. Pure so the page's default window is testable. */
export function windowStart(week: string, weeks: number): string {
  const date = new Date(`${week}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7 * Math.max(0, weeks - 1));
  return date.toISOString().slice(0, 10);
}
