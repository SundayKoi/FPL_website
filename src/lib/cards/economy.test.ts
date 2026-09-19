import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./economy";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Enough of PostgREST's builder for the reads this module makes —
 *  including its page cap, which is the whole reason the module pages. */
const PAGE = 1000;

function client(
  tables: Record<string, { data?: unknown; error?: unknown }>,
  pageSize = PAGE,
): SupabaseClient {
  const seen: { table: string; column: string; value: string }[] = [];
  const supabase = {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "order"]) chain[method] = () => chain;
      chain.eq = (column: string, value: string) => {
        seen.push({ table, column, value });
        return chain;
      };
      // range() serves the slice a real PostgREST would, so a caller that
      // fails to page sees exactly the silent truncation production had.
      chain.range = (from: number, to: number) => {
        const all = (result.data as unknown[]) ?? [];
        return Promise.resolve({
          data: all.slice(from, Math.min(to + 1, from + pageSize)),
          error: result.error ?? null,
        });
      };
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
  return Object.assign(supabase, { filters: seen }) as SupabaseClient;
}

const rowsOf = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index + 1 }));

describe("fetchAllRows", () => {
  it("pages past PostgREST's cap instead of stopping at the first response", async () => {
    const supabase = client({ card_inventory: { data: rowsOf(250), error: null } }, 100);

    const { rows, truncated } = await fetchAllRows(supabase, "card_inventory", "id", "S5", 100);

    expect(rows).toHaveLength(250);
    expect(truncated).toBe(false);
  });

  it("says so rather than lying when the page ceiling is hit", async () => {
    const supabase = client({ card_inventory: { data: rowsOf(250), error: null } }, 2);

    // Two rows a page against a 100-page ceiling stops at 200.
    const { rows, truncated } = await fetchAllRows(supabase, "card_inventory", "id", "S5", 2, 100);

    expect(rows).toHaveLength(200);
    expect(truncated).toBe(true);
  });

  it("returns what it has instead of throwing when a table is missing", async () => {
    const supabase = client({ card_moments: { data: [], error: { message: "no such table" } } });

    const { rows, truncated } = await fetchAllRows(supabase, "card_moments", "id", "S5");

    expect(rows).toEqual([]);
    expect(truncated).toBe(false);
  });

  it("filters by season, and by whatever else the caller asks for", async () => {
    const supabase = client({ card_trades: { data: rowsOf(1), error: null } });

    await fetchAllRows(supabase, "card_trades", "id", "S5", 1000, 100, { status: "open" });

    expect((supabase as unknown as { filters: { column: string; value: string }[] }).filters).toEqual([
      { table: "card_trades", column: "season", value: "S5" },
      { table: "card_trades", column: "status", value: "open" },
    ]);
  });
});
