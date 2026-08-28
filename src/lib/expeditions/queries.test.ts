import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDeployedCopyIds, fetchRuns } from "./queries";

type QueryCall = { table: string; filters: Record<string, unknown> };
type QueryResult = { data: unknown; error: unknown };
type Respond = (call: QueryCall) => { data?: unknown; error?: unknown };

/** A chainable, awaitable PostgREST stand-in — packs/open.test.ts's helper,
 *  trimmed to the read verbs these two queries use. */
function createService(respond: Respond) {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: {} };
    calls.push(call);
    const settle = (): QueryResult => {
      const result = respond(call) ?? {};
      return { data: result.data ?? null, error: result.error ?? null };
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      is: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => settle(),
      then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  const client = { from } as unknown as SupabaseClient;
  return { client, calls };
}

const OUT = {
  id: 4,
  tier: "raid",
  squad: [11, 12, 13],
  shine: 19,
  started_at: "2026-08-27T18:00:00.000Z",
  resolves_at: "2026-08-28T18:00:00.000Z",
  outcome: null,
  claimed_at: null,
};

const HOME = {
  id: 3,
  tier: "legend",
  squad: [21, 22, 23],
  shine: 30,
  started_at: "2026-08-25T18:00:00.000Z",
  resolves_at: "2026-08-27T18:00:00.000Z",
  outcome: { grade: "jackpot", dollars: 520, comp: true, mark: "legend", bearer: 22 },
  claimed_at: "2026-08-27T19:00:00.000Z",
};

describe("fetchRuns", () => {
  it("reads one owner's season and hands the rows over in the app's names", async () => {
    const service = createService(() => ({ data: [OUT, HOME] }));

    expect(await fetchRuns(service.client, "42", "s4")).toEqual([
      {
        id: 4,
        tier: "raid",
        squad: [11, 12, 13],
        shine: 19,
        startedAt: "2026-08-27T18:00:00.000Z",
        resolvesAt: "2026-08-28T18:00:00.000Z",
        outcome: null,
        claimedAt: null,
      },
      {
        id: 3,
        tier: "legend",
        squad: [21, 22, 23],
        shine: 30,
        startedAt: "2026-08-25T18:00:00.000Z",
        resolvesAt: "2026-08-27T18:00:00.000Z",
        outcome: { grade: "jackpot", dollars: 520, comp: true, mark: "legend", bearer: 22 },
        claimedAt: "2026-08-27T19:00:00.000Z",
      },
    ]);
    expect(service.calls[0]).toMatchObject({
      table: "expedition_runs",
      filters: { discord_id: "42", season: "s4" },
    });
  });

  it("survives a squad column that came back empty", async () => {
    const service = createService(() => ({ data: [{ ...OUT, squad: null }] }));

    expect(await fetchRuns(service.client, "42", "s4")).toMatchObject([{ squad: [] }]);
  });

  it("reads as no runs rather than throwing when the table isn't there yet", async () => {
    const service = createService(() => ({ data: null, error: { message: "relation does not exist" } }));

    expect(await fetchRuns(service.client, "42", "s4")).toEqual([]);
  });
});

describe("fetchDeployedCopyIds", () => {
  it("unions the squads of the runs still out", async () => {
    const service = createService((call) => ({
      // The query pins claimed_at is null; a fake that ignored it would let
      // this test pass over a query that had lost the filter.
      data: [OUT, HOME].filter((row) => (call.filters.claimed_at === null ? row.claimed_at === null : true)),
    }));

    expect(await fetchDeployedCopyIds(service.client, "42")).toEqual(new Set([11, 12, 13]));
    expect(service.calls[0]).toMatchObject({
      table: "expedition_runs",
      filters: { discord_id: "42", claimed_at: null },
    });
  });

  it("merges overlapping squads across several live runs", async () => {
    const service = createService(() => ({
      data: [{ squad: [1, 2, 3] }, { squad: [3, 4, 5] }, { squad: null }],
    }));

    expect(await fetchDeployedCopyIds(service.client, "42")).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("locks nothing rather than throwing when the read fails", async () => {
    const service = createService(() => ({ data: null, error: { message: "boom" } }));

    expect(await fetchDeployedCopyIds(service.client, "42")).toEqual(new Set());
  });
});
