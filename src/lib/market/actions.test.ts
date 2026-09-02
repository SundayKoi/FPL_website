import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));

const { rpc, from, plan, calls, reset } = vi.hoisted(() => {
  type Res = { data: unknown; error?: unknown };
  const plan: Record<string, Res[]> = {};
  const counters: Record<string, number> = {};
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function take(table: string): Res {
    const index = counters[table] ?? 0;
    counters[table] = index + 1;
    return plan[table]?.[index] ?? { data: null };
  }

  function query(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "gt", "lt", "gte", "order", "limit", "range", "not"]) {
      builder[method] = () => builder;
    }
    builder.insert = (payload: unknown) => {
      calls.push({ table, op: "insert", payload });
      return builder;
    };
    builder.update = (payload: unknown) => {
      calls.push({ table, op: "update", payload });
      return builder;
    };
    builder.single = () => Promise.resolve(take(table));
    builder.maybeSingle = () => Promise.resolve(take(table));
    builder.then = (resolve: (value: Res) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve(take(table)).then(resolve, reject);
    return builder;
  }

  const from = vi.fn((table: string) => query(table));
  const rpc = vi.fn();

  function reset() {
    for (const key of Object.keys(plan)) delete plan[key];
    for (const key of Object.keys(counters)) delete counters[key];
    calls.length = 0;
    from.mockClear();
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
  }

  return { rpc, from, plan, calls, reset };
});

vi.mock("@/lib/betting/service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ from, rpc })),
}));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { postCardsWebhook } = vi.hoisted(() => ({ postCardsWebhook: vi.fn() }));
vi.mock("@/lib/packs/announce", () => ({ postCardsWebhook, GOLD: 0xe8c14b, LIVE_RED: 0xff5063 }));

const { lockedInventoryIds } = vi.hoisted(() => ({ lockedInventoryIds: vi.fn() }));
vi.mock("@/lib/trades/guards", () => ({ lockedInventoryIds }));

const { fetchDeployedCopyIds } = vi.hoisted(() => ({ fetchDeployedCopyIds: vi.fn() }));
vi.mock("@/lib/expeditions/queries", () => ({ fetchDeployedCopyIds }));

const { fetchCardSeason } = vi.hoisted(() => ({ fetchCardSeason: vi.fn() }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason }));

import { buyListing, cancelListing, cancelWant, createListing, createWant, fillWant } from "./actions";
import { MAX_LISTING_ASK, MAX_NOTE_CHARS, MAX_OPEN_LISTINGS, MAX_OPEN_WANTS } from "./config";

const USER = {
  discordId: "42",
  profileId: "p1",
  username: "Zed",
  balance: 5000,
  allowed: true,
  staff: false,
};

const MY_COPY = {
  id: 11,
  discord_id: "42",
  season: "S5",
  slug: "doug-na1",
  player_name: "Doug",
  edition_week: "2026-08-24",
};

beforeEach(() => {
  getBettingUser.mockReset().mockResolvedValue(USER);
  reset();
  revalidatePath.mockReset();
  postCardsWebhook.mockReset().mockResolvedValue(undefined);
  lockedInventoryIds.mockReset().mockResolvedValue(new Set());
  fetchDeployedCopyIds.mockReset().mockResolvedValue(new Set());
  fetchCardSeason.mockReset().mockResolvedValue("S5");
});

describe("access guards", () => {
  const runs: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ["createListing", () => createListing({ inventoryId: 11, ask: 500 })],
    ["cancelListing", () => cancelListing(1)],
    ["buyListing", () => buyListing(1)],
    ["createWant", () => createWant({ slug: "doug-na1", bounty: 500 })],
    ["cancelWant", () => cancelWant(1)],
    ["fillWant", () => fillWant(1, 11)],
  ];

  it.each(runs)("%s refuses a signed-out caller without touching the database", async (_name, run) => {
    getBettingUser.mockResolvedValue(null);

    expect(await run()).toEqual({ ok: false, error: "Sign in with Discord to use the betting site." });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(runs)("%s refuses a caller without betting access", async (_name, run) => {
    getBettingUser.mockResolvedValue({ ...USER, allowed: false });

    expect(await run()).toEqual({ ok: false, error: "FPL Better members only." });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("createListing", () => {
  it("refuses a price that isn't a whole number inside the band", async () => {
    for (const ask of [0, -1, 1.5, MAX_LISTING_ASK + 1]) {
      const result = await createListing({ inventoryId: 11, ask });
      expect(result.ok).toBe(false);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a note the database would refuse, before writing anything", async () => {
    const result = await createListing({ inventoryId: 11, ask: 500, note: "x".repeat(MAX_NOTE_CHARS + 1) });

    expect(result).toEqual({ ok: false, error: "That note is too long." });
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a card that isn't the caller's, saying the same thing as a card that doesn't exist", async () => {
    // A stranger probing ids must not learn which ones are real.
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "99" } }];
    const theirs = await createListing({ inventoryId: 11, ask: 500 });

    reset();
    plan.card_inventory = [{ data: null }];
    const nothing = await createListing({ inventoryId: 11, ask: 500 });

    expect(theirs).toEqual({ ok: false, error: "That card isn't yours." });
    expect(nothing).toEqual(theirs);
  });

  it("refuses a card fielded in an ungraded fantasy week", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    lockedInventoryIds.mockResolvedValue(new Set([11]));

    expect(await createListing({ inventoryId: 11, ask: 500 })).toEqual({
      ok: false,
      error: "That card is fielded in this week's lineup.",
    });
  });

  it("refuses a card out on an expedition, in the words the trade builder uses", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    fetchDeployedCopyIds.mockResolvedValue(new Set([11]));

    expect(await createListing({ inventoryId: 11, ask: 500 })).toEqual({
      ok: false,
      error: "That card is out on an expedition.",
    });
  });

  it("caps how many listings one collector may have open", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    plan.card_listings = [
      { data: null }, // the lapsed-listing sweep
      { data: Array.from({ length: MAX_OPEN_LISTINGS }, (_, i) => ({ id: i })) },
    ];

    const result = await createListing({ inventoryId: 11, ask: 500 });

    expect(result.ok).toBe(false);
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });

  it("writes the listing with the season taken from the copy, never from the caller", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    plan.card_listings = [{ data: null }, { data: [] }, { data: { id: 7 } }];

    const result = await createListing({ inventoryId: 11, ask: 500, note: "  will take offers  " });

    expect(result).toEqual({ ok: true, id: 7 });
    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.payload).toEqual({
      season: "S5",
      inventory_id: 11,
      seller_discord: "42",
      ask: 500,
      note: "will take offers",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/cards/market");
    expect(revalidatePath).toHaveBeenCalledWith("/academy/cards/market");
  });

  it("retires its own lapsed listings first, or the unique index would block the relist", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    plan.card_listings = [{ data: null }, { data: [] }, { data: { id: 8 } }];

    await createListing({ inventoryId: 11, ask: 500 });

    const sweep = calls.find((call) => call.table === "card_listings" && call.op === "update");
    expect((sweep?.payload as { status: string }).status).toBe("expired");
  });

  it("turns the one-open-listing-per-copy index into a sentence", async () => {
    plan.card_inventory = [{ data: MY_COPY }];
    plan.card_listings = [{ data: null }, { data: [] }, { data: null, error: { code: "23505", message: "dup" } }];

    expect(await createListing({ inventoryId: 11, ask: 500 })).toEqual({
      ok: false,
      error: "That card is already on the market.",
    });
  });
});

describe("cancelListing", () => {
  it("says so when nothing was still open to cancel", async () => {
    plan.card_listings = [{ data: [] }];

    expect(await cancelListing(4)).toEqual({ ok: false, error: "That listing is already closed." });
  });

  it("flips a listing of the caller's own to cancelled", async () => {
    plan.card_listings = [{ data: [{ id: 4 }] }];

    expect(await cancelListing(4)).toEqual({ ok: true });
    const update = calls.find((call) => call.table === "card_listings" && call.op === "update");
    expect((update?.payload as { status: string }).status).toBe("cancelled");
  });
});

describe("buyListing", () => {
  const OPEN = { id: 3, season: "S5", inventory_id: 11, seller_discord: "99", ask: 500, status: "open" };

  it("refuses your own listing before it reaches the RPC", async () => {
    plan.card_listings = [{ data: { ...OPEN, seller_discord: "42" } }];

    expect(await buyListing(3)).toEqual({ ok: false, error: "That's your own listing." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses one that has already been taken", async () => {
    plan.card_listings = [{ data: { ...OPEN, status: "sold" } }];

    expect(await buyListing(3)).toEqual({ ok: false, error: "That listing has already been taken." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("buys as the session's Discord id, never one from the arguments", async () => {
    plan.card_listings = [{ data: OPEN }];
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "99" } }];
    plan.betting_profiles = [
      { data: [{ discord_id: "42", username: "Zed" }, { discord_id: "99", username: "Nina" }] },
    ];

    expect(await buyListing(3)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("buy_card_listing", { p_listing: 3, p_buyer: "42" });
  });

  it("announces the sale naming both sides, the card and the price", async () => {
    plan.card_listings = [{ data: OPEN }];
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "99" } }];
    plan.betting_profiles = [
      { data: [{ discord_id: "42", username: "Zed" }, { discord_id: "99", username: "Nina" }] },
    ];

    await buyListing(3);

    const embed = postCardsWebhook.mock.calls[0][0] as { title: string; description: string };
    expect(embed.title).toBe("💸 SOLD");
    expect(embed.description).toContain("Zed");
    expect(embed.description).toContain("Nina");
    expect(embed.description).toContain("Doug");
    expect(embed.description).toContain("$500");
  });

  it("never fails a settled sale because Discord did", async () => {
    plan.card_listings = [{ data: OPEN }];
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "99" } }];
    postCardsWebhook.mockRejectedValue(new Error("webhook down"));

    expect(await buyListing(3)).toEqual({ ok: true });
  });

  it.each([
    ["insufficient balance", "You don't have enough to cover that."],
    ["card is on expedition", "That card is out on an expedition."],
    ["listing is not open", "That listing has already been taken."],
    ["listing expired", "That listing has expired."],
    ["card not owned", "That card has moved on — the sale is off."],
    ["something nobody wrote a case for", "Something went wrong with that sale."],
  ])("turns the RPC's %s into a sentence", async (raw, friendly) => {
    plan.card_listings = [{ data: OPEN }];
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "99" } }];
    rpc.mockResolvedValue({ data: null, error: { message: raw } });

    expect(await buyListing(3)).toEqual({ ok: false, error: friendly });
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });
});

describe("createWant", () => {
  it("refuses a bounty outside the band without reading anything", async () => {
    expect((await createWant({ slug: "doug-na1", bounty: 0 })).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a slug this season doesn't print", async () => {
    plan.card_editions = [{ data: [] }];
    plan.card_inventory = [{ data: [] }];

    expect(await createWant({ slug: "nobody-na1", bounty: 800 })).toEqual({
      ok: false,
      error: "That player isn't in this season's cards.",
    });
  });

  it("caps how many wants one collector may have open", async () => {
    plan.card_editions = [{ data: [{ slug: "doug-na1" }] }];
    plan.card_wants = [{ data: Array.from({ length: MAX_OPEN_WANTS }, (_, i) => ({ id: i })) }];

    expect((await createWant({ slug: "doug-na1", bounty: 800 })).ok).toBe(false);
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });

  it("takes the season from the league, never from the caller", async () => {
    plan.card_editions = [{ data: [{ slug: "doug-na1" }] }];
    plan.card_wants = [{ data: [] }, { data: { id: 9 } }];

    expect(await createWant({ slug: "doug-na1", bounty: 800, league: "academy" })).toEqual({ ok: true, id: 9 });
    expect(fetchCardSeason).toHaveBeenCalledWith(expect.anything(), "academy");
    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.payload).toEqual({
      season: "S5",
      discord_id: "42",
      slug: "doug-na1",
      bounty: 800,
      note: null,
    });
  });
});

describe("cancelWant", () => {
  it("says so when nothing was still open", async () => {
    plan.card_wants = [{ data: [] }];

    expect(await cancelWant(9)).toEqual({ ok: false, error: "That want is already closed." });
  });
});

describe("fillWant", () => {
  const WANT = { id: 9, season: "S5", discord_id: "99", slug: "doug-na1", bounty: 800, status: "open" };

  it("refuses your own want", async () => {
    plan.card_wants = [{ data: { ...WANT, discord_id: "42" } }];
    plan.card_inventory = [{ data: MY_COPY }];

    expect(await fillWant(9, 11)).toEqual({ ok: false, error: "That's your own want." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a copy of a different player", async () => {
    plan.card_wants = [{ data: WANT }];
    plan.card_inventory = [{ data: { ...MY_COPY, slug: "spies-na1" } }];

    expect(await fillWant(9, 11)).toEqual({ ok: false, error: "That copy isn't the card they asked for." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a copy from another season even when the slug matches", async () => {
    plan.card_wants = [{ data: WANT }];
    plan.card_inventory = [{ data: { ...MY_COPY, season: "S4" } }];

    expect(await fillWant(9, 11)).toEqual({ ok: false, error: "That copy isn't the card they asked for." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a copy that isn't yours", async () => {
    plan.card_wants = [{ data: WANT }];
    plan.card_inventory = [{ data: { ...MY_COPY, discord_id: "77" } }];

    expect(await fillWant(9, 11)).toEqual({ ok: false, error: "That card isn't yours." });
  });

  it("refuses a deployed copy before the poster's money is involved", async () => {
    plan.card_wants = [{ data: WANT }];
    plan.card_inventory = [{ data: MY_COPY }];
    fetchDeployedCopyIds.mockResolvedValue(new Set([11]));

    expect(await fillWant(9, 11)).toEqual({ ok: false, error: "That card is out on an expedition." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fills as the session's Discord id and announces the sale", async () => {
    plan.card_wants = [{ data: WANT }];
    plan.card_inventory = [{ data: MY_COPY }];
    plan.betting_profiles = [
      { data: [{ discord_id: "42", username: "Zed" }, { discord_id: "99", username: "Nina" }] },
    ];

    expect(await fillWant(9, 11)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fill_card_want", { p_want: 9, p_seller: "42", p_inventory: 11 });
    const embed = postCardsWebhook.mock.calls[0][0] as { description: string };
    // The poster is the buyer here — the roles swap round on this board.
    expect(embed.description).toContain("**Nina** bought");
    expect(embed.description).toContain("$800");
  });
});
