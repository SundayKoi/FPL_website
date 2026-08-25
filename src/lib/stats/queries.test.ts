import { describe, expect, it, vi } from "vitest";

/** Swapped per test; the mock below reads it at call time. */
const harness = { client: null as unknown };
vi.mock("@/lib/supabase/client", () => ({ createClient: () => harness.client }));

import { compareSeasonsNewestFirst, fetchPlayerKeysForTeams, fetchSeasons } from "./queries";

// The pure sort helper, plus the paging every fetcher here now shares —
// the network calls run against a stand-in client rather than Supabase.

describe("compareSeasonsNewestFirst", () => {
  it("sorts numeric season codes newest first, not lexicographically", () => {
    const seasons = ["S1", "S10", "S2", "S9"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S10", "S9", "S2", "S1"]);
  });

  it("keeps a plain S1..S4 run in the expected newest-first order", () => {
    const seasons = ["S3", "S1", "S4", "S2"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S4", "S3", "S2", "S1"]);
  });

  it("falls back to descending string compare for non-numeric codes", () => {
    const seasons = ["Preseason", "Beta"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["Preseason", "Beta"]);
  });

  it("puts numeric codes ahead of non-numeric codes", () => {
    const seasons = ["Preseason", "S1"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S1", "Preseason"]);
  });
});

/** A Supabase stand-in whose read hands out `pages` one `.range()` call at
 *  a time, recording the windows and order keys requested. */
function pagedClient(pages: unknown[][]) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const client = {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in"]) chain[method] = () => chain;
      chain.order = (column: string) => {
        orders.push(column);
        return chain;
      };
      chain.range = (from: number, to: number) => {
        ranges.push([from, to]);
        return Promise.resolve({ data: pages[ranges.length - 1] ?? [], error: null });
      };
      return chain;
    },
  };
  return { client, ranges, orders };
}

describe("paging over the stats views", () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ summoner_name: `p${i}`, tag: "NA1" }));

  it("keeps reading past a full page", async () => {
    // PostgREST caps a response at max_rows and says nothing about it, so an
    // unpaged read returns a plausible-looking prefix — which is how a
    // leaderboard quietly loses half a season.
    const { client } = pagedClient([page(1000), [{ summoner_name: "last", tag: "NA1" }]]);
    harness.client = client;

    const keys = await fetchPlayerKeysForTeams(["Storm"]);

    expect(keys.size).toBe(1001);
    expect(keys.has("last#na1")).toBe(true);
  });

  it("asks for the next window, not the same one twice", async () => {
    const { client, ranges } = pagedClient([page(1000), []]);
    harness.client = client;

    await fetchPlayerKeysForTeams(["Storm"]);

    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("stops on the first short page", async () => {
    const { client, ranges } = pagedClient([[{ summoner_name: "only", tag: "NA1" }]]);
    harness.client = client;

    await fetchPlayerKeysForTeams(["Storm"]);

    expect(ranges).toHaveLength(1);
  });

  it("orders every page by a total key, so pages cannot skip a row", async () => {
    // Paging on a non-unique column lets the database repeat one row on a
    // page and skip another, and a skipped row is invisible.
    const { client, orders } = pagedClient([[]]);
    harness.client = client;

    await fetchPlayerKeysForTeams(["Storm"]);

    expect(orders).toEqual(["id"]);
  });

  it("reads every page of the season list, not just the first", async () => {
    // One row per GAME for a handful of distinct seasons: this crosses the
    // cap long before the league runs out of seasons, and a truncated read
    // drops a whole season out of the picker.
    const seasons = Array.from({ length: 1000 }, (_, i) => ({ season: "S5", match_id: `m${i}` }));
    const { client } = pagedClient([seasons, [{ season: "S1", match_id: "old" }]]);
    harness.client = client;

    expect(await fetchSeasons()).toEqual(["S5", "S1"]);
  });
});
