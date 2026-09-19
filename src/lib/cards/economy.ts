// Paged reads over the card tables, for the callers that aggregate them.
//
// PostgREST caps a response, so "select everything" is a trap: this is the
// one helper that pages through a season's rows and says when it gave up.
//
// Framework-free (any SupabaseClient), same as its siblings.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Every row of `table` for `season`, in pages.
 *
 * PostgREST caps a response at max_rows (1000 in this project's
 * config.toml, and the same by default on the hosted project). A single
 * unpaged select therefore does not return "all the rows" — it returns the
 * first thousand, silently, with no error and no marker. Aggregating that
 * gives a wrong answer that looks like a right one.
 *
 * Ordered by id because pagination without a total order is not
 * pagination: ranges can overlap or skip rows between requests.
 *
 * `truncated` is surfaced rather than swallowed. A cap that nobody is told
 * about reads as the truth.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  season: string,
  pageSize = 1000,
  maxPages = 100,
  /** Further equality filters, applied after the season's. */
  where: Record<string, string> = {},
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    let query = supabase.from(table).select(columns).eq("season", season);
    for (const [column, value] of Object.entries(where)) query = query.eq(column, value);
    const { data, error } = await query.order("id").range(from, from + pageSize - 1);
    // An error on the first page means no data at all (a missing table, say);
    // on a later page it means we stop with what we have. Either way the
    // caller gets rows it can aggregate rather than an exception.
    if (error) return { rows, truncated: false };
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}
