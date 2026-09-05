import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchDeployedCopyIds, fetchFixturesSince, fetchLedger, fetchRuns } from "./queries";

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
      in: (column: string, values: unknown) => {
        call.filters[column] = values;
        return builder;
      },
      gte: (column: string, value: unknown) => {
        call.filters[`${column}>=`] = value;
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
        // A row from before forks: the columns read as their defaults.
        forks: 0,
        choices: [],
        insured: false,
        target: null,
        fee: 0,
        encounters: [],
        rules: 1,
      },
      {
        id: 3,
        tier: "legend",
        squad: [21, 22, 23],
        shine: 30,
        startedAt: "2026-08-25T18:00:00.000Z",
        resolvesAt: "2026-08-27T18:00:00.000Z",
        outcome: {
          grade: "jackpot", dollars: 520, comp: true, mark: "legend", bearer: 22,
          lootMultiplier: 1, pushes: 0, fragments: 0, fates: [], events: [], rescued: null, cleansed: null,
          surge: [], echo: null,
        },
        claimedAt: "2026-08-27T19:00:00.000Z",
        forks: 0,
        choices: [],
        insured: false,
        target: null,
        fee: 0,
        encounters: [],
        rules: 1,
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

describe("fetchFixturesSince", () => {
  it("reads the calendar from the date on, and as empty when the table is missing", async () => {
    const rows = [{ team_a: "A", team_b: "B", scheduled_at: "2026-09-08T00:00:00.000Z" }];
    const service = createService(() => ({ data: rows }));

    expect(await fetchFixturesSince(service.client, "2026-09-01T00:00:00.000Z")).toEqual(rows);
    expect(service.calls[0]).toMatchObject({ table: "fixtures", filters: { "scheduled_at>=": "2026-09-01T00:00:00.000Z" } });

    const broken = createService(() => ({ data: null, error: { message: "relation does not exist" } }));
    expect(await fetchFixturesSince(broken.client, "2026-09-01T00:00:00.000Z")).toEqual([]);
  });
});

describe("fetchLedger", () => {
  const GRAVES = [
    { id: 1, discord_id: "42", season: "s4", player_name: "Doug", tier: "gold", foil: false, signed: false, run_id: 900, cause: "route", died_at: "2026-08-27T10:00:00.000Z" },
    { id: 2, discord_id: "43", season: "s4", player_name: "Eve", tier: "platinum", foil: true, signed: false, run_id: null, cause: "unrescued", died_at: "2026-08-26T10:00:00.000Z" },
  ];
  const HOLDS = [
    // Still missing: dated by when it runs out.
    { id: 10, discord_id: "42", season: "s4", squad: [501], resolves_at: "2026-09-02T10:00:00.000Z", claimed_at: null, outcome: null, target: 901 },
    // Carried home by a stranger's squad.
    { id: 11, discord_id: "43", season: "s4", squad: [502], resolves_at: "2026-09-01T10:00:00.000Z", claimed_at: "2026-08-28T10:00:00.000Z", outcome: { rescued: true, by: 950, stranger: "44" }, target: 901 },
    // Ransomed.
    { id: 12, discord_id: "42", season: "s4", squad: [503], resolves_at: "2026-09-01T10:00:00.000Z", claimed_at: "2026-08-25T10:00:00.000Z", outcome: { ransomed: true, dollars: 340 }, target: null },
    // Ran out: the grave (id 2) already lists it, so the hold is skipped.
    { id: 13, discord_id: "43", season: "s4", squad: [504], resolves_at: "2026-08-26T10:00:00.000Z", claimed_at: "2026-08-26T10:00:00.000Z", outcome: { expired: true }, target: 901 },
  ];
  const service = () =>
    createService((call) => {
      if (call.table === "expedition_graveyard") return { data: GRAVES };
      if (call.table === "expedition_runs" && call.filters.tier === "lost") return { data: HOLDS };
      if (call.table === "expedition_runs") return { data: [{ id: 900, tier: "legendary" }, { id: 901, tier: "legend" }] };
      if (call.table === "card_inventory")
        return {
          data: [
            { id: 501, player_name: "Fay", tier: "gold", foil: false, signed: true },
            { id: 502, player_name: "Gus", tier: "silver", foil: false, signed: false },
            { id: 503, player_name: "Hal", tier: "diamond", foil: true, signed: false },
          ],
        };
      if (call.table === "betting_profiles")
        return { data: [{ discord_id: "42", username: "Kai", avatar_url: null }, { discord_id: "44", username: "Rio", avatar_url: "https://cdn/rio.png" }] };
      return { data: null };
    });

  it("lists every grave and every hold that is open or came home, newest first, with owners and routes", async () => {
    const ledger = await fetchLedger(service().client);

    expect(ledger.map((entry) => [entry.key, entry.kind, entry.playerName, entry.owner.username, entry.route])).toEqual([
      ["hold-10", "missing", "Fay", "Kai", "legend"],
      ["hold-11", "carried", "Gus", "Unknown", "legend"],
      ["grave-1", "died", "Doug", "Kai", "legendary"],
      ["grave-2", "buried", "Eve", "Unknown", null],
      ["hold-12", "ransomed", "Hal", "Kai", null],
    ]);
    expect(ledger[1].by).toEqual({ discordId: "44", username: "Rio" });
    expect(ledger[0]).toMatchObject({ signed: true, at: "2026-09-02T10:00:00.000Z" });
  });

  it("looks the routes, cards and people up once each, by id", async () => {
    const board = service();
    await fetchLedger(board.client);

    const byId = board.calls.filter((call) => call.table === "expedition_runs" && Array.isArray(call.filters.id));
    expect(byId).toHaveLength(1);
    expect((byId[0].filters.id as number[]).sort()).toEqual([900, 901]);
    expect(board.calls.find((call) => call.table === "card_inventory")?.filters.id).toEqual([501, 502, 503]);
    expect((board.calls.find((call) => call.table === "betting_profiles")?.filters.discord_id as string[]).sort()).toEqual(["42", "43", "44"]);
  });

  it("is empty when nothing has ever been lost", async () => {
    const empty = createService(() => ({ data: [] }));
    expect(await fetchLedger(empty.client)).toEqual([]);
    expect(empty.calls).toHaveLength(2);
  });
});
