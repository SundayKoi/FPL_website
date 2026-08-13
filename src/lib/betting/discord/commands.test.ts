import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// commands.ts (via service-client.ts) is `import "server-only"` — same stub
// as queries.test.ts/wallet.test.ts (vitest resolves that package's default
// "throws by design" export, not the "react-server" condition Next's
// bundler swaps it for).
vi.mock("server-only", () => ({}));

/** A minimal chainable mock of the supabase-js query builder — every filter
 * method returns the same builder, and the builder resolves to `result`
 * whether the caller awaits it directly or calls `.maybeSingle()`. Mirrors
 * queries.test.ts's `chain()`, extended with `gt` for the /exchange handler. */
function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

/** Queues one `{data,error}` response per call to `.from(table)`, keyed by
 * table name (same convention as queries.test.ts's `makeFrom`). */
function makeFrom(responses: Record<string, { data: unknown; error?: unknown }[]>) {
  const counters: Record<string, number> = {};
  return vi.fn((table: string) => {
    const i = counters[table] ?? 0;
    counters[table] = i + 1;
    const queue = responses[table] ?? [];
    return chain(queue[i] ?? { data: null });
  });
}

const rpcImpl = { current: vi.fn() };
const fromImpl = { current: vi.fn() };
vi.mock("../service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({
    rpc: (...args: [string, object]) => rpcImpl.current(...args),
    from: (...args: [string]) => fromImpl.current(...args),
  })),
}));

// Importing commands.ts runs its module-level `commandHandlers.x = ...`
// registration (see the file's own header comment for why route.ts relies
// on this same side effect).
import { commandHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import "./commands";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  rpcImpl.current = vi.fn(() => Promise.resolve({ data: null, error: null }));
  fromImpl.current = makeFrom({});
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function baseInteraction(overrides: Partial<DiscordInteraction> = {}): DiscordInteraction {
  return {
    id: "i1",
    application_id: "a1",
    type: 2,
    token: "t1",
    member: { user: { id: "caller-1", username: "Caller" }, roles: [] },
    ...overrides,
  } as DiscordInteraction;
}

describe("/balance", () => {
  it("returns an ephemeral wallet embed with the formatted balance + record", async () => {
    fromImpl.current = makeFrom({
      betting_leaderboard: [{ data: { balance: 1500, wins: 3, losses: 1 } }],
    });

    const res = (await commandHandlers.balance(baseInteraction())) as {
      type: number;
      data: { flags?: number; embeds: Array<{ title: string; fields: Array<{ name: string; value: string }> }> };
    };

    expect(res.data.flags).toBe(64); // ephemeral
    const e = res.data.embeds[0];
    expect(e.title).toBe("Wallet");
    expect(e.fields).toEqual([
      { name: "Balance", value: "$1,500" },
      { name: "Record", value: "3W / 1L" },
    ]);
    // ensure-user ran before the wallet read
    expect(rpcImpl.current).toHaveBeenCalledWith(
      "grant_signup_bonus",
      expect.objectContaining({ p_user: "caller-1", p_amount: 1000 })
    );
  });
});

describe("/daily", () => {
  it("returns the already-claimed error embed with Discord relative + absolute timestamps", async () => {
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "claim_daily_streak") {
        return Promise.resolve({ data: null, error: { message: "daily already claimed" } });
      }
      if (fn === "daily_next_at") {
        return Promise.resolve({ data: "2030-01-02T00:00:00.000Z", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const res = (await commandHandlers.daily(baseInteraction())) as {
      data: { flags?: number; embeds: Array<{ description: string }> };
    };

    expect(res.data.flags).toBe(64);
    const unix = Math.floor(new Date("2030-01-02T00:00:00.000Z").getTime() / 1000);
    expect(res.data.embeds[0].description).toBe(
      `❌ You've already claimed your daily. Come back <t:${unix}:R> (at <t:${unix}:t>).`
    );
  });
});

describe("/tip", () => {
  it("rejects tipping yourself before calling any RPC", async () => {
    const interaction = baseInteraction({
      data: {
        name: "tip",
        options: [
          { name: "user", value: "caller-1" },
          { name: "amount", value: 100 },
        ],
        resolved: { users: { "caller-1": { id: "caller-1", username: "Caller", bot: false } } },
      } as unknown as DiscordInteraction["data"],
    });

    const res = (await commandHandlers.tip(interaction)) as { data: { embeds: Array<{ description: string }> } };

    expect(res.data.embeds[0].description).toContain("Pick another member to tip.");
    expect(rpcImpl.current).not.toHaveBeenCalled();
  });
});

describe("/buy", () => {
  it("refunds the purchase when granting a discord_role fails", async () => {
    process.env.DISCORD_GUILD_ID = "guild-1";
    process.env.DISCORD_BOT_TOKEN = "bot-token";
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 403 } as Response));

    rpcImpl.current = vi.fn((fn: string, args: Record<string, unknown>) => {
      if (fn === "grant_signup_bonus") return Promise.resolve({ data: null, error: null });
      if (fn === "start_purchase") return Promise.resolve({ data: 55, error: null });
      if (fn === "refund_purchase") {
        expect(args).toEqual({ p_purchase: 55 });
        return Promise.resolve({ data: 700, error: null });
      }
      if (fn === "fulfill_purchase") throw new Error("fulfill_purchase should not be called on grant failure");
      return Promise.resolve({ data: null, error: null });
    });
    fromImpl.current = makeFrom({
      betting_store_items: [{ data: { name: "VIP Role", type: "discord_role", payload: { role_id: "999" }, cost: 500 } }],
    });

    const interaction = baseInteraction({
      data: { name: "buy", options: [{ name: "item", value: 7 }] } as unknown as DiscordInteraction["data"],
    });

    const res = (await commandHandlers.buy(interaction)) as { data: { embeds: Array<{ description: string }> } };

    expect(global.fetch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/guilds/guild-1/members/caller-1/roles/999",
      expect.objectContaining({ method: "PUT" })
    );
    expect(res.data.embeds[0].description).toContain("Couldn't grant **VIP Role**");
    expect(res.data.embeds[0].description).toContain("refunded (balance $700)");
  });
});

describe("registration", () => {
  it("wires all eight commands into the shared registry", () => {
    for (const name of ["balance", "daily", "tip", "bets", "leaderboard", "exchange", "store", "buy"]) {
      expect(commandHandlers[name]).toBeTypeOf("function");
    }
  });
});
