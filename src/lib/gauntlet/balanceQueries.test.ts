import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BALANCE_MAX_PAGES, BALANCE_PAGE, fetchBalanceTape, windowStart } from "./balanceQueries";

interface Call {
  table: string;
  /** The order the builder methods were called in — the whole point. */
  chain: string[];
  from: number;
  to: number;
}

/**
 * A Supabase stand-in that behaves like the real one in the way that
 * matters here: `.range()` returns a TRANSFORM builder with no `.eq()` or
 * `.gte()` on it. A filter added after the range throws, exactly as it
 * does in production — a bug that shipped once already and only showed up
 * on the page that used it.
 */
function fakeClient(pages: Record<string, unknown[]>, calls: Call[] = []) {
  const client = {
    from(table: string) {
      const chain: string[] = [];
      let from = 0;
      let to = BALANCE_PAGE - 1;
      const filters = {
        select() {
          chain.push("select");
          return filters;
        },
        eq() {
          if (chain.includes("range")) throw new TypeError("query.eq is not a function");
          chain.push("eq");
          return filters;
        },
        gte() {
          if (chain.includes("range")) throw new TypeError("query.gte is not a function");
          chain.push("gte");
          return filters;
        },
        order() {
          chain.push("order");
          return filters;
        },
        range(start: number, end: number) {
          chain.push("range");
          from = start;
          to = end;
          calls.push({ table, chain: [...chain], from, to });
          return Promise.resolve({
            data: (pages[table] ?? []).slice(start, end + 1),
            error: null,
          });
        },
      };
      return filters;
    },
  };
  return client as unknown as SupabaseClient;
}

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1, round: 1 }));
}

describe("the balance tape reads", () => {
  it("filters before it orders and ranges", () => {
    // The lesson, locked: PostgREST's transform builder has no filters on
    // it, so a .eq() after .range() is a TypeError at runtime.
    const calls: Call[] = [];
    const client = fakeClient({ gauntlet_round_log: [], gauntlet_relic_offers: [] }, calls);
    return fetchBalanceTape(client, { season: "S4", sinceWeek: "2026-08-03" }).then(() => {
      expect(calls.length).toBe(2);
      for (const call of calls) {
        expect(call.chain).toEqual(["select", "eq", "gte", "order", "range"]);
      }
    });
  });

  it("pages past the thousand-row ceiling", async () => {
    // 2500 rounds is three pages. An unpaged read would return the first
    // thousand with NO error and no marker — a report that looks fine and
    // is wrong about two thirds of the week.
    const calls: Call[] = [];
    const client = fakeClient(
      { gauntlet_round_log: rows(2500), gauntlet_relic_offers: rows(10) },
      calls,
    );
    const tape = await fetchBalanceTape(client);
    expect(tape.rounds.length).toBe(2500);
    expect(tape.truncated).toBe(false);
    const roundCalls = calls.filter((call) => call.table === "gauntlet_round_log");
    expect(roundCalls.map((call) => call.from)).toEqual([0, 1000, 2000]);
  });

  it("stops at one page when the first page is short", async () => {
    const calls: Call[] = [];
    const client = fakeClient({ gauntlet_round_log: rows(12), gauntlet_relic_offers: rows(3) }, calls);
    await fetchBalanceTape(client);
    expect(calls.filter((call) => call.table === "gauntlet_round_log").length).toBe(1);
  });

  it("says so instead of silently reading a slice", async () => {
    const client = fakeClient({
      gauntlet_round_log: rows(BALANCE_PAGE * BALANCE_MAX_PAGES + 1),
      gauntlet_relic_offers: [],
    });
    const tape = await fetchBalanceTape(client);
    expect(tape.truncated).toBe(true);
    expect(tape.rounds.length).toBe(BALANCE_PAGE * BALANCE_MAX_PAGES);
  });

  it("reports a missing table as an empty tape, not a crash", async () => {
    const client = {
      from() {
        const builder = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data: null, error: { code: "42P01", message: "does not exist" } }),
        };
        return builder;
      },
    } as unknown as SupabaseClient;
    const tape = await fetchBalanceTape(client);
    expect(tape.missing).toBe(true);
    expect(tape.rounds).toEqual([]);
    expect(tape.truncated).toBe(false);
  });
});

describe("windowStart", () => {
  it("counts the given week as the first of N", () => {
    expect(windowStart("2026-08-24", 1)).toBe("2026-08-24");
    expect(windowStart("2026-08-24", 4)).toBe("2026-08-03");
  });

  it("never runs forward", () => {
    expect(windowStart("2026-08-24", 0)).toBe("2026-08-24");
  });
});
