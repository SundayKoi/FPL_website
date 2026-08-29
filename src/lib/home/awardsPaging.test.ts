import { describe, expect, it, vi } from "vitest";

/** A raw_stats table served the way PostgREST serves one: a page at a time,
 *  capped at max_rows, with no error and no marker when it stops short. */
const PAGE = 1000;
const table: { id: number; season: string; team_name: string }[] = Array.from({ length: 2350 }, (_, index) => ({
  id: index + 1,
  season: "S5",
  team_name: index % 2 === 0 ? "Wolves" : "Bears",
}));

const ranges: [number, number][] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from() {
      const filters: { team?: string[] } = {};
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => chain;
      chain.in = (_column: string, values: string[]) => {
        filters.team = values;
        return chain;
      };
      chain.range = (from: number, to: number) => {
        ranges.push([from, to]);
        const rows = filters.team ? table.filter((row) => filters.team!.includes(row.team_name)) : table;
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + PAGE)), error: null });
      };
      return chain;
    },
  }),
}));

const { fetchHomepageRawStats } = await import("./awards");

describe("fetchHomepageRawStats", () => {
  it("reads a whole season rather than the first thousand rows of it", async () => {
    // The bug: no paging and no order at all, so PostgREST answered with
    // max_rows of them in whatever order the planner chose — and every
    // homepage award is derived from the whole set, so Player of the Week
    // was decided on an arbitrary slice of the season.
    ranges.length = 0;
    const rows = await fetchHomepageRawStats("S5");

    expect(rows).toHaveLength(2350);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("keeps the team filter on every page, not just the first", async () => {
    ranges.length = 0;
    const rows = await fetchHomepageRawStats("S5", ["Wolves"]);

    expect(rows).toHaveLength(1175);
    expect(rows.every((row) => (row as unknown as { team_name: string }).team_name === "Wolves")).toBe(true);
  });

  it("asks for nothing at all when the team list is empty", async () => {
    ranges.length = 0;
    expect(await fetchHomepageRawStats("S5", [])).toEqual([]);
    expect(ranges).toEqual([]);
  });
});
