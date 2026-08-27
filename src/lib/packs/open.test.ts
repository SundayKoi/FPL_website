import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// open.ts is `import "server-only"` — vitest resolves that package's default
// export condition (which throws by design) rather than the "react-server"
// one Next.js's bundler uses. Stub it so the module can load, same as
// wallet.test.ts.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createBettingServiceClient } = vi.hoisted(() => ({ createBettingServiceClient: vi.fn() }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));

// The pool, the roll and the art are all somebody else's tested job — these
// stubs pin them so the only thing moving in this suite is the money.
vi.mock("@/lib/cards/queries", () => ({
  fetchCardSeason: vi.fn(async () => "s4"),
  fetchCardEditionWeeks: vi.fn(async () => ["2026-08-24"]),
  fetchEditionCards: vi.fn(async () => [{ slug: "doug-na1" }]),
  fetchCurrentWeekCards: vi.fn(async () => [{ slug: "doug-na1" }]),
  fetchWeekMoments: vi.fn(async () => []),
}));
vi.mock("./rng", () => ({
  rollPack: vi.fn(() => [
    {
      card: { slug: "doug-na1", name: "Doug", role: "Mid", overall: 82, tier: { key: "gold", label: "Gold" } },
      foil: false,
      foilType: null,
      signed: false,
    },
  ]),
}));
vi.mock("./signatures", () => ({
  applyAutographs: vi.fn((pulls: unknown[]) => pulls.map((pull) => ({ ...(pull as object), autograph: null }))),
}));
vi.mock("./skins", () => ({
  fetchChampionSkinNums: vi.fn(async () => [0]),
  printArtExists: vi.fn(async () => true),
  splashArtExists: vi.fn(async () => true),
  rollPrint: vi.fn(async () => 0),
}));
vi.mock("./announce", () => ({ postCardsWebhook: vi.fn(), GOLD: 0 }));

const { openChampionsPack, openPackFor, refundPackComp, spendPackComp } = await import("./open");

/** One PostgREST call, flattened: which table, which verb, the filters it
 *  pinned and the payload it wrote. The fakes below answer off this. */
type QueryCall = {
  table: string;
  verb: "select" | "insert" | "update";
  payload?: unknown;
  filters: Record<string, unknown>;
};

type QueryResult = { data: unknown; error: unknown; count: number | null };

interface QueryBuilder {
  select: (columns?: string, opts?: { count?: string; head?: boolean }) => QueryBuilder;
  insert: (payload: unknown) => QueryBuilder;
  update: (payload: unknown) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  not: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  single: () => Promise<QueryResult>;
  then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
}

/**
 * A stand-in `card_pack_comps` that really does compare-and-swap: an update
 * lands only while the `remaining` it pinned is still the row's value. That
 * is the whole point of the helpers under test, so faking it with a
 * "returns what you asked for" mock would test nothing.
 */
function createCompTable(initial: Record<string, number> = {}) {
  const rows = new Map<string, number>(Object.entries(initial));
  /** Plays the other click: runs once, right after a read, so the CAS that
   *  follows is racing a row that moved under it. */
  let raceOnce: (() => void) | null = null;
  return {
    rows,
    race(other: () => void) {
      raceOnce = other;
    },
    respond(call: QueryCall): { data: unknown } {
      const kind = String(call.filters.kind);
      if (call.verb === "select") {
        const remaining = rows.get(kind);
        const data = remaining === undefined ? null : { discord_id: call.filters.discord_id, kind, remaining };
        if (raceOnce) {
          const other = raceOnce;
          raceOnce = null;
          other();
        }
        return { data };
      }
      const current = rows.get(kind);
      // `.eq("remaining", held)` is the swap guard — no match, no write.
      if (current === undefined || current !== call.filters.remaining) return { data: [] };
      const next = (call.payload as { remaining: number }).remaining;
      rows.set(kind, next);
      return { data: [{ remaining: next }] };
    },
  };
}

type Respond = (call: QueryCall) => { data?: unknown; error?: unknown; count?: number };

/** A chainable, awaitable PostgREST stand-in. Every terminal (`maybeSingle`,
 *  `single`, or awaiting the builder) settles through `respond`. */
function createService(respond: Respond) {
  const calls: QueryCall[] = [];
  const rpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
  const from = vi.fn((table: string): QueryBuilder => {
    const call: QueryCall = { table, verb: "select", filters: {} };
    calls.push(call);
    const settle = (): QueryResult => {
      const result = respond(call) ?? {};
      return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
    };
    const builder: QueryBuilder = {
      select: () => builder,
      insert: (payload) => {
        call.verb = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload) => {
        call.verb = "update";
        call.payload = payload;
        return builder;
      },
      eq: (column, value) => {
        call.filters[column] = value;
        return builder;
      },
      is: (column, value) => {
        call.filters[column] = value;
        return builder;
      },
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => settle(),
      single: async () => settle(),
      then: (resolve, reject) => Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, calls, rpc, from };
}

/** The rest of the open flow's reads, answered the boring way so each test
 *  only has to say what it cares about. */
function createShop(opts: { comps?: Record<string, number>; insertError?: unknown } = {}) {
  const table = createCompTable(opts.comps ?? {});
  const service = createService((call) => {
    if (call.table === "card_pack_comps") return table.respond(call);
    if (call.table === "card_art_prefs") return { data: [] };
    if (call.table === "league_settings") {
      // champions_until in the future keeps the Faceless Drop open for the
      // champions tests; openPackFor only reads the live-drop columns.
      return { data: { live_until: null, live_label: null, champions_until: "2099-01-01T00:00:00.000Z" } };
    }
    if (call.table === "card_chases") return { data: null };
    if (call.table === "betting_profiles") return { data: { balance: 1000 } };
    if (call.table === "card_inventory" && call.verb === "insert") {
      if (opts.insertError) return { data: null, error: opts.insertError };
      // openPackFor inserts an array and reads back rows; the champions
      // flow inserts one and `.single()`s it.
      return { data: Array.isArray(call.payload) ? [{ id: 501 }] : { id: 501 } };
    }
    return { data: null };
  });
  createBettingServiceClient.mockReturnValue(service.client);
  return { ...service, table };
}

/** Every `pack_open_id` the inventory insert stamped. */
function stampedOpenIds(calls: QueryCall[]): unknown[] {
  const insert = calls.find((call) => call.table === "card_inventory" && call.verb === "insert");
  const payload = insert?.payload;
  const rows = (Array.isArray(payload) ? payload : [payload]) as { pack_open_id?: unknown }[];
  return rows.map((row) => row.pack_open_id);
}

beforeEach(() => {
  createBettingServiceClient.mockReset();
});

describe("spendPackComp", () => {
  it("takes one off the count and reports what is left", async () => {
    const shop = createShop({ comps: { standard: 2 } });

    expect(await spendPackComp(shop.client, "42", "standard")).toBe(1);
    expect(shop.table.rows.get("standard")).toBe(1);
  });

  it("returns null — and writes nothing — when the holder has none", async () => {
    const shop = createShop({ comps: { standard: 0 } });

    expect(await spendPackComp(shop.client, "42", "standard")).toBeNull();
    expect(shop.table.rows.get("standard")).toBe(0);
    expect(shop.calls.some((call) => call.table === "card_pack_comps" && call.verb === "update")).toBe(false);
  });

  it("returns null when the holder has no comp row at all", async () => {
    const shop = createShop();

    expect(await spendPackComp(shop.client, "42", "standard")).toBeNull();
  });

  it("retries against the new count when another click wins the race", async () => {
    const shop = createShop({ comps: { standard: 2 } });
    // The other click spends one between our read and our swap: the guarded
    // update misses, and the retry has to work off 1, not the stale 2.
    shop.table.race(() => shop.table.rows.set("standard", 1));

    expect(await spendPackComp(shop.client, "42", "standard")).toBe(0);
    // Two comps held, two spent — never the same one twice.
    expect(shop.table.rows.get("standard")).toBe(0);
  });

  it("gives up rather than looping when it keeps losing", async () => {
    const shop = createShop({ comps: { standard: 3 } });
    const steal = () => {
      shop.table.rows.set("standard", (shop.table.rows.get("standard") ?? 1) - 1);
      shop.table.race(steal);
    };
    shop.table.race(steal);

    expect(await spendPackComp(shop.client, "42", "standard")).toBeNull();
    const updates = shop.calls.filter((call) => call.table === "card_pack_comps" && call.verb === "update");
    expect(updates).toHaveLength(2);
  });
});

describe("refundPackComp", () => {
  it("hands the comp back", async () => {
    const shop = createShop({ comps: { standard: 0 } });

    expect(await refundPackComp(shop.client, "42", "standard")).toBe(true);
    expect(shop.table.rows.get("standard")).toBe(1);
  });

  it("refuses to mint a comp when the grant row is gone", async () => {
    const shop = createShop();

    expect(await refundPackComp(shop.client, "42", "standard")).toBe(false);
    expect(shop.table.rows.has("standard")).toBe(false);
  });
});

describe("openPackFor comps", () => {
  it("spends a standard comp instead of charging, and says how many are left", async () => {
    const shop = createShop({ comps: { standard: 1 } });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ compsLeft: 0 });
    // The charge never happened...
    expect(shop.rpc).not.toHaveBeenCalledWith("open_card_pack", expect.anything());
    // ...so the cards belong to no paid open, exactly like a comped
    // Faceless Pack.
    expect(stampedOpenIds(shop.calls)).toEqual([null]);
    expect(shop.table.rows.get("standard")).toBe(0);
  });

  it("charges as usual when no comp is held", async () => {
    const shop = createShop({ comps: { standard: 0 } });
    shop.rpc.mockResolvedValue({ data: 77, error: null });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("compsLeft");
    expect(shop.rpc).toHaveBeenCalledWith("open_card_pack", { p_user: "42", p_season: "s4", p_cost: 200 });
    expect(stampedOpenIds(shop.calls)).toEqual([77]);
  });

  it("never spends a comp on the free daily rip", async () => {
    const shop = createShop({ comps: { standard: 1 } });
    shop.rpc.mockResolvedValue({ data: { open_id: 9, streak: 1, bonus: 0 }, error: null });

    const result = await openPackFor("42", "premier", { daily: true });

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("compsLeft");
    expect(shop.rpc).toHaveBeenCalledWith("open_daily_pack", { p_user: "42", p_season: "s4" });
    expect(shop.table.rows.get("standard")).toBe(1);
  });

  it("gives the comp back — not a wallet refund — when the cards fail to land", async () => {
    const shop = createShop({ comps: { standard: 1 }, insertError: { message: "insert exploded" } });

    const result = await openPackFor("42", "premier");

    expect(result).toEqual({ ok: false, error: "That pack didn't open — your free pack wasn't spent." });
    expect(shop.table.rows.get("standard")).toBe(1);
    // Nothing was charged, so there is nothing to reverse.
    expect(shop.rpc).not.toHaveBeenCalledWith("refund_card_pack", expect.anything());
  });

  it("says so plainly when the comp cannot be handed back", async () => {
    const shop = createShop({ comps: { standard: 1 }, insertError: { message: "insert exploded" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // The grant row vanishes after the spend — there is nothing left to add
    // the comp back to, and inventing a row would mint a free pack out of an
    // error.
    const swap = shop.table.respond;
    let spent = false;
    vi.spyOn(shop.table, "respond").mockImplementation((call: QueryCall) => {
      if (spent) return { data: null };
      const answer = swap(call);
      if (call.verb === "update") spent = true;
      return answer;
    });

    const result = await openPackFor("42", "premier");

    expect(result).toEqual({
      ok: false,
      error: "That pack didn't open and the free pack couldn't be returned — staff have been notified.",
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("openChampionsPack comps", () => {
  it("still spends its own kind of comp, never the shop's", async () => {
    const shop = createShop({ comps: { champions: 2, standard: 1 } });

    const result = await openChampionsPack("42");

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ compsLeft: 1 });
    expect(shop.rpc).not.toHaveBeenCalledWith("open_card_pack", expect.anything());
    expect(stampedOpenIds(shop.calls)).toEqual([null]);
    expect(shop.table.rows.get("champions")).toBe(1);
    expect(shop.table.rows.get("standard")).toBe(1);
  });

  it("charges when the tribute is used up", async () => {
    const shop = createShop({ comps: { champions: 0 } });
    shop.rpc.mockResolvedValue({ data: 88, error: null });

    const result = await openChampionsPack("42");

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("compsLeft");
    expect(shop.rpc).toHaveBeenCalledWith("open_card_pack", expect.objectContaining({ p_user: "42" }));
    expect(stampedOpenIds(shop.calls)).toEqual([88]);
  });

  it("returns the tribute comp when the relic fails to land", async () => {
    const shop = createShop({ comps: { champions: 1 }, insertError: { message: "insert exploded" } });

    const result = await openChampionsPack("42");

    expect(result).toEqual({ ok: false, error: "That pack didn't open — your free pack wasn't spent." });
    expect(shop.table.rows.get("champions")).toBe(1);
    expect(shop.rpc).not.toHaveBeenCalledWith("refund_card_pack", expect.anything());
  });
});
