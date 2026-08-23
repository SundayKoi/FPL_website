import { vi } from "vitest";

export type SupabaseQueryResult = { data: unknown; error?: unknown };
export type SupabaseFilterCall = { table: string; method: string; args: unknown[] };

/**
 * Minimal thenable Supabase query builder for unit tests. It supports the
 * read-only filters used by the betting query modules and records filter
 * calls when a test needs to verify query scoping.
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
    gt: filter("gt"),
    gte: filter("gte"),
    not: filter("not"),
    order: filter("order"),
    limit: filter("limit"),
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
