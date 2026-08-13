import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// components.ts (via service-client.ts) is `import "server-only"` — same stub
// as commands.test.ts/queries.test.ts (vitest resolves that package's default
// "throws by design" export, not the "react-server" condition Next's
// bundler swaps it for).
vi.mock("server-only", () => ({}));

/** A minimal chainable mock of the supabase-js query builder — mirrors
 * commands.test.ts's `chain()`. */
function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (r: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

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

// Importing components.ts runs its module-level `componentHandlers.bet = ...`
// / `modalHandlers.betmodal = ...` registration (mirrors commands.ts's
// registration side effect that commands.test.ts relies on the same way).
import { componentHandlers, modalHandlers } from "./registry";
import type { DiscordInteraction } from "./registry";
import "./components";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  rpcImpl.current = vi.fn(() => Promise.resolve({ data: null, error: null }));
  fromImpl.current = makeFrom({});
  process.env = { ...ORIGINAL_ENV, SITE_URL: "https://fplexchange.com", DISCORD_BOT_TOKEN: "bot-token" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function memberInteraction(overrides: Partial<DiscordInteraction> = {}): DiscordInteraction {
  return {
    id: "i1",
    application_id: "a1",
    type: 3,
    token: "t1",
    channel_id: "chan-1",
    member: { user: { id: "bettor-1", username: "Bettor" }, roles: [] },
    ...overrides,
  } as DiscordInteraction;
}

describe("bet button (componentHandlers.bet)", () => {
  it("responds with the stake modal when the market is OPEN", async () => {
    fromImpl.current = makeFrom({ betting_markets: [{ data: { status: "OPEN" } }] });
    const interaction = memberInteraction({ data: { custom_id: "bet:42:-1:ARS" } as unknown as DiscordInteraction["data"] });

    const res = (await componentHandlers.bet(interaction)) as {
      type: number;
      data: { custom_id: string; title: string; components: Array<{ components: Array<{ custom_id: string; label: string }> }> };
    };

    expect(res.type).toBe(9); // MODAL
    expect(res.data.custom_id).toBe("betmodal:42:-1:ARS");
    expect(res.data.title).toBe("Bet on ARS");
    expect(res.data.components[0].components[0]).toMatchObject({ custom_id: "amount", label: "Amount", max_length: 12 });
  });

  it("returns an ephemeral closed error when the market is not OPEN", async () => {
    fromImpl.current = makeFrom({ betting_markets: [{ data: { status: "LOCKED" } }] });
    const interaction = memberInteraction({ data: { custom_id: "bet:42:-1:ARS" } as unknown as DiscordInteraction["data"] });

    const res = (await componentHandlers.bet(interaction)) as { type: number; data: { flags?: number; embeds: Array<{ description: string }> } };

    expect(res.type).toBe(4);
    expect(res.data.flags).toBe(64);
    expect(res.data.embeds[0].description).toContain("This market is closed for betting.");
  });
});

describe("bet amount modal (modalHandlers.betmodal)", () => {
  function modalInteraction(value: string, overrides: Partial<DiscordInteraction> = {}): DiscordInteraction {
    return memberInteraction({
      type: 5,
      data: {
        custom_id: "betmodal:42:-1:ARS",
        components: [{ components: [{ custom_id: "amount", value }] }],
      } as unknown as DiscordInteraction["data"],
      ...overrides,
    });
  }

  it("strips commas/$ and calls place_bet with the parsed integer amount", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "place_bet") return Promise.resolve({ data: 8500, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const res = (await modalHandlers.betmodal(modalInteraction("$1,500"))) as {
      data: { flags?: number; embeds: Array<{ description: string }> };
    };

    expect(rpcImpl.current).toHaveBeenCalledWith(
      "place_bet",
      expect.objectContaining({ p_user: "bettor-1", p_market: 42, p_team: -1, p_amount: 1500 })
    );
    expect(res.data.flags).toBe(64);
    expect(res.data.embeds[0].description).toContain("✅ Bet **$1,500** on **ARS** placed!");
    expect(res.data.embeds[0].description).toContain("Balance **$8,500**");
    expect(res.data.embeds[0].description).toContain("[View market](https://fplexchange.com/betting/market/42)");
  });

  it("rejects a non-numeric amount before calling any RPC", async () => {
    const res = (await modalHandlers.betmodal(modalInteraction("abc"))) as {
      data: { embeds: Array<{ description: string }> };
    };

    expect(res.data.embeds[0].description).toContain("Enter a whole positive amount.");
    expect(rpcImpl.current).not.toHaveBeenCalled();
  });

  it("rejects a zero/negative amount before calling any RPC", async () => {
    const res = (await modalHandlers.betmodal(modalInteraction("0"))) as {
      data: { embeds: Array<{ description: string }> };
    };

    expect(res.data.embeds[0].description).toContain("Enter a whole positive amount.");
    expect(rpcImpl.current).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error and does not confirm when place_bet raises", async () => {
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "place_bet") return Promise.resolve({ data: null, error: { message: "market 42 locked" } });
      return Promise.resolve({ data: null, error: null });
    });

    const res = (await modalHandlers.betmodal(modalInteraction("500"))) as {
      data: { embeds: Array<{ description: string }> };
    };

    expect(res.data.embeds[0].description).not.toContain("✅");
    expect(res.data.embeds[0].description.toLowerCase()).toContain("locked");
  });

  it("posts a public shout with an author strip to the interaction's channel via the Discord REST API", async () => {
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "place_bet") return Promise.resolve({ data: 500, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));

    await modalHandlers.betmodal(
      modalInteraction("500", {
        member: {
          user: { id: "bettor-1", username: "Bettor", global_name: "Bettor Global", avatar: "avatarhash" },
          nick: "Bettor Nick",
          roles: [],
        },
      })
    );

    expect(global.fetch).toHaveBeenCalledWith(
      "https://discord.com/api/v10/channels/chan-1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bot bot-token" }),
      })
    );
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].description).toBe("🎲 <@bettor-1> bet **$500** on **ARS**!");
    // author strip — port of main.py's `pub.set_author(name=..., icon_url=...)`;
    // nick takes priority over global_name/username.
    expect(body.embeds[0].author).toEqual({
      name: "Bettor Nick",
      icon_url: "https://cdn.discordapp.com/avatars/bettor-1/avatarhash.png",
    });
  });

  it("falls back to global_name, then username, when no server nickname is set", async () => {
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "place_bet") return Promise.resolve({ data: 500, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response));

    // no nick, no global_name, no avatar — falls all the way back to username
    await modalHandlers.betmodal(modalInteraction("500"));

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.embeds[0].author).toEqual({ name: "Bettor", icon_url: null });
  });

  it("still returns the private confirmation when the public shout POST fails", async () => {
    rpcImpl.current = vi.fn((fn: string) => {
      if (fn === "place_bet") return Promise.resolve({ data: 500, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));

    const res = (await modalHandlers.betmodal(modalInteraction("500"))) as {
      data: { flags?: number; embeds: Array<{ description: string }> };
    };

    expect(res.data.flags).toBe(64);
    expect(res.data.embeds[0].description).toContain("✅ Bet **$500** on **ARS** placed!");
  });
});

describe("registration", () => {
  it("wires the bet button and modal into their respective registries", () => {
    expect(componentHandlers.bet).toBeTypeOf("function");
    expect(modalHandlers.betmodal).toBeTypeOf("function");
  });
});
