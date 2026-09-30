import { vi } from "vitest";

export type SupabaseQueryResult = { data: unknown; error?: unknown; count?: number | null };
export type SupabaseFilterCall = { table: string; method: string; args: unknown[] };

/**
 * Minimal thenable Supabase query builder for unit tests. It supports the
 * common read-only filters and terminals, and records filter calls when a
 * test needs to verify query scoping.
 */
export function supabaseQuery(
  result: SupabaseQueryResult,
  record?: (method: string, args: unknown[]) => void,
) {
  const filter =
    (method: string) =>
    (...args: unknown[]) => {
      record?.(method, args);
      return builder;
    };
  const builder: Record<string, unknown> = {
    select: filter("select"),
    in: filter("in"),
    eq: filter("eq"),
    neq: filter("neq"),
    is: filter("is"),
    gt: filter("gt"),
    gte: filter("gte"),
    lt: filter("lt"),
    lte: filter("lte"),
    not: filter("not"),
    order: filter("order"),
    limit: filter("limit"),
    // Passthrough: enough for a paging caller not to explode. A test that
    // needs to prove paging (rather than just tolerate it) supplies its own
    // slicing mock — see fetchCollectors' row-cap test.
    range: filter("range"),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: SupabaseQueryResult) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Replays an independent queue of Supabase results for each table. */
export function makeSupabaseFrom(
  responses: Record<string, SupabaseQueryResult[]>,
  log?: SupabaseFilterCall[],
) {
  const counters: Record<string, number> = {};
  return vi.fn((table: string) => {
    const index = counters[table] ?? 0;
    counters[table] = index + 1;
    const queue = responses[table] ?? [];
    return supabaseQuery(
      queue[index] ?? { data: null },
      (method, args) => log?.push({ table, method, args }),
    );
  });
}
