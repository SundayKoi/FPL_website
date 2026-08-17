import { describe, expect, it, vi } from "vitest";

// queries.ts is `import "server-only"` — same stub as wallet.test.ts (vitest
// resolves that package's default "throws by design" export, not the
// "react-server" condition Next.js's bundler swaps it for).
vi.mock("server-only", () => ({}));

/**
 * A minimal chainable mock of the supabase-js query builder: every filter
 * method (`select`/`in`/`eq`/`gt`/`gte`/`not`/`order`/`limit`) returns the
 * same builder, and the builder resolves to `result` whether the caller
 * awaits it directly (PostgrestBuilder is thenable) or calls `.maybeSingle()`
 * — good enough for queries.ts's read-only chains, which never care which of
 * those the production code used to terminate the chain.
 */
type FilterCall = { table: string; method: string; args: unknown[] };

function chain(result: { data: unknown; error?: unknown }, record?: (method: string, args: unknown[]) => void) {
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
    then: (resolve: (r: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Builds a `from(table)` mock that replays a queue of results per table —
 * queries.ts calls `.from("betting_pickems")` up to twice per fetchOpenPickem
 * (the OPEN/LOCKED check, then the resolved/cancelled fallback) and
 * `.from("betting_pickem_cards")` twice (pool aggregation, then the viewer's
 * own card), so each table needs its own ordered queue. Filter-method calls
 * land in `log` (when given) so tests can assert on scoping like
 * `.eq("event_id", …)`. */
function makeFrom(responses: Record<string, { data: unknown }[]>, log?: FilterCall[]) {
  const counters: Record<string, number> = {};
  return vi.fn((table: string) => {
    const i = counters[table] ?? 0;
    counters[table] = i + 1;
    const queue = responses[table] ?? [];
    return chain(queue[i] ?? { data: null }, (method, args) => log?.push({ table, method, args }));
  });
}

const fromImpl = { current: vi.fn() };
vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ from: (...args: [string]) => fromImpl.current(...args) })),
}));

import { fetchEventSummaries, fetchOpenPickem } from "./queries";

const teamA = { id: 11, name: "AAA Team", short_code: "AAA", color: "#111", logo_url: null };
const teamB = { id: 12, name: "BBB Team", short_code: "BBB", color: "#222", logo_url: null };
const market1 = {
  id: 1,
  team_a_id: 11,
  team_b_id: 12,
  title: null,
  status: "OPEN",
  game_at: "2030-01-01T01:00:00Z",
  winning_team_id: null,
};

describe("fetchOpenPickem", () => {
  it("returns the OPEN pick'em when one is live", async () => {
    fromImpl.current = makeFrom({
      betting_pickems: [{ data: { id: 9, title: "Friday Night", status: "OPEN", carryover: 500, lock_at: "2030-01-01T00:55:00Z" } }],
      betting_pickem_legs: [{ data: [{ market_id: 1 }] }],
      betting_markets: [{ data: [market1] }],
      betting_pickem_cards: [{ data: [{ amount: 300 }] }, { data: { amount: 300, picks: { "1": 11 }, correct: null, payout: null, settled: false } }],
      betting_teams: [{ data: [teamA, teamB] }],
    });

    const result = await fetchOpenPickem("viewer-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(9);
    expect(result!.status).toBe("OPEN");
    expect(result!.pool).toBe(800); // 300 staked + 500 carryover
    expect(result!.legs).toHaveLength(1);
    expect(result!.my_card).toEqual({ amount: 300, picks: { 1: 11 }, correct: null, payout: null, settled: false });
    // only the OPEN/LOCKED query ran — no fallback query needed
    expect(fromImpl.current.mock.calls.filter(([t]) => t === "betting_pickems")).toHaveLength(1);
  });

  it("falls back to the most recent RESOLVED pick'em when none is open, so the result stays reachable", async () => {
    fromImpl.current = makeFrom({
      betting_pickems: [
        { data: null }, // no OPEN/LOCKED pick'em
        { data: { id: 4, title: "Last Night", status: "RESOLVED", carryover: 0, lock_at: "2030-01-01T00:00:00Z" } },
      ],
      betting_pickem_legs: [{ data: [{ market_id: 1 }] }],
      betting_markets: [{ data: [{ ...market1, status: "RESOLVED", winning_team_id: 11 }] }],
      betting_pickem_cards: [{ data: [{ amount: 300 }] }, { data: { amount: 300, picks: { "1": 11 }, correct: 1, payout: 300, settled: true } }],
      betting_teams: [{ data: [teamA, teamB] }],
    });

    const result = await fetchOpenPickem("viewer-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe(4);
    expect(result!.status).toBe("RESOLVED");
    expect(result!.my_card?.payout).toBe(300);
    // both the OPEN/LOCKED query and the resolved/cancelled fallback ran
    expect(fromImpl.current.mock.calls.filter(([t]) => t === "betting_pickems")).toHaveLength(2);
  });

  it("returns null when there's no open pick'em and nothing resolved within the grace window", async () => {
    fromImpl.current = makeFrom({
      betting_pickems: [{ data: null }, { data: null }],
    });

    const result = await fetchOpenPickem("viewer-1");

    expect(result).toBeNull();
    // neither query found a row, so no downstream (legs/markets/cards/teams) calls fired
    expect(fromImpl.current).toHaveBeenCalledTimes(2);
  });

  it("returns null (without a viewer id) when nothing is live or recently settled", async () => {
    fromImpl.current = makeFrom({
      betting_pickems: [{ data: null }, { data: null }],
    });

    const result = await fetchOpenPickem();

    expect(result).toBeNull();
  });

  it("scopes both the live query and the resolved fallback to the event when an eventId is given", async () => {
    const log: FilterCall[] = [];
    fromImpl.current = makeFrom(
      {
        betting_pickems: [{ data: null }, { data: null }],
      },
      log
    );

    await fetchOpenPickem("viewer-1", 7);

    const eventFilters = log.filter((c) => c.table === "betting_pickems" && c.method === "eq");
    expect(eventFilters).toHaveLength(2);
    expect(eventFilters.every((c) => c.args[0] === "event_id" && c.args[1] === 7)).toBe(true);
  });
});

describe("fetchEventSummaries", () => {
  it("aggregates per-event market counts and pick'em state, live events first by soonest lock", async () => {
    fromImpl.current = makeFrom({
      betting_events: [
        {
          data: [
            { id: 1, name: "Premier S5", description: null },
            { id: 2, name: "Academy S1", description: "The academy league" },
            { id: 3, name: "Preseason Cup", description: null },
          ],
        },
      ],
      betting_markets: [
        {
          data: [
            { event_id: 1, status: "OPEN", lock_at: "2030-01-02T00:00:00Z" },
            { event_id: 1, status: "LOCKED", lock_at: "2030-01-01T00:00:00Z" },
            { event_id: 2, status: "OPEN", lock_at: "2030-01-01T12:00:00Z" },
          ],
        },
      ],
      betting_pickems: [{ data: [{ event_id: 2, status: "OPEN", lock_at: "2030-01-01T06:00:00Z" }] }],
    });

    const result = await fetchEventSummaries();

    // Academy's pick'em locks first, so it leads; idle Preseason Cup sinks last.
    expect(result.map((e) => e.name)).toEqual(["Academy S1", "Premier S5", "Preseason Cup"]);

    const academy = result[0];
    expect(academy.open_markets).toBe(1);
    expect(academy.locked_markets).toBe(0);
    expect(academy.has_live_pickem).toBe(true);
    expect(academy.next_lock_at).toBe("2030-01-01T06:00:00Z");

    const premier = result[1];
    expect(premier.open_markets).toBe(1);
    expect(premier.locked_markets).toBe(1);
    expect(premier.has_live_pickem).toBe(false);
    // LOCKED markets no longer accept bets, so they don't drive "next lock".
    expect(premier.next_lock_at).toBe("2030-01-02T00:00:00Z");

    expect(result[2]).toMatchObject({ open_markets: 0, locked_markets: 0, has_live_pickem: false, next_lock_at: null });
  });

  it("returns an empty list when no events exist", async () => {
    fromImpl.current = makeFrom({});

    expect(await fetchEventSummaries()).toEqual([]);
  });
});
