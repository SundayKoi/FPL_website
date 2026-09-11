import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// open.ts is `import "server-only"` — vitest resolves that package's default
// export condition (which throws by design) rather than the "react-server"
// one Next.js's bundler uses. Stub it so the module can load, same as
// wallet.test.ts.
vi.mock("server-only", () => ({}));
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
const { afterMock, scheduledAfterCallbacks } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  scheduledAfterCallbacks: [] as Array<() => void | Promise<void>>,
}));
vi.mock("next/server", () => ({
  after: (callback: () => void | Promise<void>) => {
    scheduledAfterCallbacks.push(callback);
    afterMock(callback);
  },
}));
vi.mock("node:crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:crypto")>()),
  // Deterministic zeroes make the specialty-pack signed branch testable
  // without changing production odds or the ordinary pack roller.
  randomBytes: vi.fn(() => Buffer.alloc(6)),
}));

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
  // The roster-plate roll is a real CSPRNG draw against TEAM_PULL_CHANCE,
  // so about one run in fifty took this branch and died on an unmocked
  // read — a flake that failed the whole suite at random and looked, every
  // time, like it belonged to whatever had just been changed.
  fetchTeamIdentity: vi.fn(async () => ({ colors: {} })),
}));
vi.mock("./rng", () => ({
  rollPack: vi.fn(() => [
    ...Array.from({ length: 5 }, () => ({
      card: { slug: "doug-na1", name: "Doug", role: "Mid", overall: 82, tier: { key: "gold", label: "Gold" } },
      foil: false,
      foilType: null,
      signed: false,
    })),
  ]),
}));
const { signedSlugs, signedPullIndexes } = vi.hoisted(() => ({
  signedSlugs: new Set<string>(),
  signedPullIndexes: new Set<number>(),
}));
vi.mock("./signatures", () => ({
  applyAutographs: vi.fn((pulls: unknown[]) => pulls.map((pull, index) => {
    const row = pull as { card: { slug: string }; foil: boolean; foilType: string | null };
    const signed = signedSlugs.has(row.card.slug) && (signedPullIndexes.size === 0 || signedPullIndexes.has(index));
    return {
      ...(pull as object),
      foil: row.foil || signed,
      foilType: row.foilType ?? (signed ? "prisma" : null),
      signed,
      autograph: signed ? "data:image/png;base64,signature" : null,
    };
  })),
  signedChance: vi.fn(() => 0),
}));
vi.mock("./godGate", () => ({ rollGodPackGate: vi.fn(() => false) }));
vi.mock("./skins", () => ({
  fetchChampionSkinNums: vi.fn(async () => [0]),
  printArtExists: vi.fn(async () => true),
  splashArtExists: vi.fn(async () => true),
  rollPrint: vi.fn(async () => 0),
}));
const { postCardsWebhook } = vi.hoisted(() => ({ postCardsWebhook: vi.fn() }));
vi.mock("./announce", () => ({ postCardsWebhook, GOLD: 0 }));
const { rollEclipseCandidates } = vi.hoisted(() => ({ rollEclipseCandidates: vi.fn((): number[] => []) }));
vi.mock("./eclipse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./eclipse")>()),
  rollEclipseCandidates,
}));
// The finishes roll off the same CSPRNG as everything else, so a test that
// wants one has to say so: the roller is swapped, the stamper is real.
const { rollPackFinishes } = vi.hoisted(() => ({
  rollPackFinishes: vi.fn((prints: unknown[]) => prints.map(() => ({ shiny: false, stattrak: false, secret: false }))),
}));
vi.mock("./rarities", async (importOriginal) => ({ ...(await importOriginal<typeof import("./rarities")>()), rollPackFinishes }));
// The Dribb gate, same discipline: the roll is swapped, the card is real.
const { rollDribb } = vi.hoisted(() => ({ rollDribb: vi.fn(() => false) }));
vi.mock("@/lib/cards/dribb", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/cards/dribb")>()), rollDribb }));

const { openChampionsPack, openPackFor, refundPackComp, spendPackComp } = await import("./open");

async function drainAfterCallbacks(): Promise<void> {
  await Promise.all(scheduledAfterCallbacks.splice(0).map((callback) => callback()));
}

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
  in: (...args: unknown[]) => QueryBuilder;
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
  const rpc = vi.fn(async (...args: [string?, Record<string, unknown>?]): Promise<{ data: unknown; error: unknown }> => {
    void args;
    return { data: null, error: null };
  });
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
      in: () => builder,
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
function createShop(opts: {
  comps?: Record<string, number>;
  insertError?: unknown;
  refundError?: unknown;
  replayFulfillment?: boolean;
  secretsFound?: number;
  dribbFound?: number;
  signatures?: { summoner_name: string; tag: string; signature: string }[];
  championSignature?: { summoner_name: string; tag: string; signature: string; season?: string };
  profile?: { username?: string; patron_until?: string | null; balance?: number };
  profileError?: unknown;
} = {}) {
  const table = createCompTable(opts.comps ?? {});
  const service = createService((call) => {
    if (call.table === "card_pack_comps") return table.respond(call);
    if (call.table === "card_art_prefs") {
      return call.filters.summoner_name
        ? { data: opts.championSignature ? [opts.championSignature] : [] }
        : { data: opts.signatures ?? [] };
    }
    if (call.table === "league_settings") {
      // champions_until in the future keeps the Faceless Drop open for the
      // champions tests; openPackFor only reads the live-drop columns.
      return { data: { live_until: null, live_label: null, champions_until: "2099-01-01T00:00:00.000Z" } };
    }
    if (call.table === "card_chases") return { data: null };
    if (call.table === "betting_profiles") return {
      data: { balance: 1000, ...opts.profile },
      error: opts.profileError ?? null,
    };
    if (call.table === "card_inventory" && call.verb === "select" && opts.replayFulfillment) {
      return {
        data: [501, 502, 503, 504, 505].map((id) => ({
          id,
          card: { slug: `persisted-${id}`, name: `Persisted ${id}`, tier: { key: "gold", label: "Gold" } },
          foil: true,
          foil_type: "prisma",
          signed: false,
          edition_week: "2026-08-24",
        })),
      };
    }
    if (call.table === "card_inventory" && call.verb === "insert") {
      if (opts.insertError) return { data: null, error: opts.insertError };
      // openPackFor inserts an array and reads back rows; the champions
      // flow inserts one and `.single()`s it.
      return { data: Array.isArray(call.payload) ? [{ id: 501 }] : { id: 501 } };
    }
    // The season's Secret count (a Secret's over-number) and the world's
    // Dribb count (its number) come through the same head-count select.
    if (call.table === "card_inventory" && call.verb === "select") return { data: [], count: opts.dribbFound ?? opts.secretsFound ?? 0 };
    return { data: null };
  });
  const openings = new Map<string, { opening_id: string; open_id: number | null; source: "paid" | "daily" | "comp"; comps_left: number | null }>();
  let nextOpening = 1;
  service.rpc.mockImplementation(async (name = "", args: Record<string, unknown> = {}) => {
    if (name === "open_card_pack") return { data: args.p_cost === 250 ? 88 : 77, error: null };
    if (name === "open_daily_pack") return { data: { open_id: 9, streak: 1, bonus: 0 }, error: null };
    if (name === "begin_card_pack_opening") {
      const requestId = String(args.p_request_id);
      const prior = openings.get(requestId);
      if (prior) {
        return {
          data: {
            ...prior,
            status: "fulfilled",
            variant: "standard",
            variant_resolved: true,
            streak: null,
            bonus: 0,
            card_ids: [501, 502, 503, 504, 505],
            reveal_order: [501, 502, 503, 504, 505],
          },
          error: null,
        };
      }
      const source = String(args.p_source);
      let actual: "paid" | "daily" | "comp" = "paid";
      let openId: number | null = null;
      let compsLeft: number | null = null;
      if (source === "daily") {
        actual = "daily";
        const daily = await service.rpc("open_daily_pack", { p_user: args.p_user, p_season: args.p_season });
        openId = (daily.data as { open_id: number }).open_id;
      } else if ((table.rows.get("standard") ?? 0) > 0) {
        actual = "comp";
        table.rows.set("standard", (table.rows.get("standard") ?? 1) - 1);
        compsLeft = table.rows.get("standard") ?? 0;
      } else {
        const paid = await service.rpc("open_card_pack", { p_user: args.p_user, p_season: args.p_season, p_cost: args.p_cost });
        openId = paid.data as number;
      }
      const opening = { opening_id: `opening-${nextOpening++}`, open_id: openId, source: actual, comps_left: compsLeft };
      openings.set(requestId, opening);
      return {
        data: {
          ...opening,
          status: "pending",
          variant: "standard",
          variant_resolved: false,
          streak: actual === "daily" ? 1 : null,
          bonus: 0,
          card_ids: [],
          reveal_order: [],
        },
        error: null,
      };
    }
    if (name === "fulfill_card_pack_opening") {
      const opening = [...openings.values()].find((row) => row.opening_id === args.p_opening);
      if (opts.replayFulfillment) return { data: { card_ids: [501, 502, 503, 504, 505], minted: false }, error: null };
      if (opts.insertError) return { data: null, error: opts.insertError };
      const cards = (args.p_cards as Record<string, unknown>[]).map((card, index) => ({
        ...card,
        card: card.card_json,
        discord_id: "42",
        pack_open_id: opening?.open_id ?? null,
        opening_id: opening?.opening_id ?? null,
        id: 501 + index,
      }));
      service.from("card_inventory").insert(cards);
      return { data: { card_ids: cards.map((card) => card.id), minted: true }, error: null };
    }
    if (name === "set_card_pack_variant") return { data: args.p_variant, error: null };
    if (name === "refund_card_pack_opening") {
      const opening = [...openings.values()].find((row) => row.opening_id === args.p_opening);
      if (opening?.source === "comp") table.rows.set("standard", (table.rows.get("standard") ?? 0) + 1);
      return { data: null, error: opts.refundError ?? null };
    }
    if (name === "refund_card_pack") return { data: null, error: null };
    return { data: null, error: null };
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

/** The card json the inventory insert froze, one per print. */
function insertedCards(calls: QueryCall[]): Record<string, unknown>[] {
  const insert = calls.find((call) => call.table === "card_inventory" && call.verb === "insert");
  const rows = (Array.isArray(insert?.payload) ? insert!.payload : [insert?.payload]) as {
    card?: Record<string, unknown>;
    card_json?: Record<string, unknown>;
  }[];
  return rows.map((row) => row.card ?? row.card_json ?? {});
}

beforeEach(() => {
  scheduledAfterCallbacks.splice(0);
  afterMock.mockClear();
  revalidatePath.mockClear();
  createBettingServiceClient.mockReset();
  postCardsWebhook.mockClear();
  postCardsWebhook.mockResolvedValue(undefined);
  signedSlugs.clear();
  signedPullIndexes.clear();
  rollEclipseCandidates.mockReset();
  rollEclipseCandidates.mockReturnValue([]);
  rollPackFinishes.mockClear();
  rollDribb.mockReset();
  rollDribb.mockReturnValue(false);
});

describe("openPackFor finishes", () => {
  it("freezes nothing extra into an ordinary pull", async () => {
    const shop = createShop();

    await openPackFor("42", "premier");

    const [card] = insertedCards(shop.calls);
    expect(card.shiny).toBeUndefined();
    expect(card.stattrak).toBeUndefined();
    expect(card.secret).toBeUndefined();
    // No Secret, no count read: the only card_inventory call is the insert.
    expect(shop.calls.filter((call) => call.table === "card_inventory")).toHaveLength(1);
    expect(postCardsWebhook).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("freezes a Shiny and a zeroed StatTrak into the copy", async () => {
    rollPackFinishes.mockReturnValueOnce([
      { shiny: true, stattrak: true, secret: false },
      ...Array.from({ length: 4 }, () => ({ shiny: false, stattrak: false, secret: false })),
    ]);
    const shop = createShop();

    await openPackFor("42", "premier");

    const [card] = insertedCards(shop.calls);
    expect(card.shiny).toBe(true);
    expect(card.stattrak).toMatchObject({ points: 0 });
    expect(typeof (card.stattrak as { since: string }).since).toBe("string");
    expect(card.secret).toBeUndefined();
  });

  it("numbers a Secret past the checklist from the season's count, and tells the channel", async () => {
    rollPackFinishes.mockReturnValueOnce([
      { shiny: false, stattrak: false, secret: true },
      ...Array.from({ length: 4 }, () => ({ shiny: false, stattrak: false, secret: false })),
    ]);
    const shop = createShop({ secretsFound: 2 });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    const [card] = insertedCards(shop.calls);
    // The stubbed roll carries no collectionSize, so the checklist is 0 and
    // the third Secret of the season is #3 past it.
    expect(card.secret).toEqual({ number: 3, of: 0 });
    expect(postCardsWebhook).not.toHaveBeenCalled();
    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining("SECRET") });
  });

  it("mints the Dribb card into the last slot, numbered after the ones found, and tells the channel", async () => {
    rollDribb.mockReturnValueOnce(true);
    const shop = createShop({ dribbFound: 2 });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    const insert = shop.calls.find((call) => call.table === "card_inventory" && call.verb === "insert")!;
    const rows = insert.payload as { slug: string; tier: string; player_name: string; overall: number; card: Record<string, unknown> }[];
    const last = rows[rows.length - 1];
    expect(last.slug).toBe("dribb");
    expect(last.tier).toBe("dribb");
    expect(last.player_name).toBe("Dribb");
    expect(last.overall).toBe(99);
    expect(last.card.dribb).toEqual({ number: 3, of: 5 });
    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining("DRIBB") });
  });

  it("closes the gate once five are found", async () => {
    rollDribb.mockReturnValueOnce(true);
    const shop = createShop({ dribbFound: 5 });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    const [card] = insertedCards(shop.calls);
    expect(card.dribb).toBeUndefined();
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });
});

describe("signature announcements", () => {
  const playerSignature = { summoner_name: "Doug", tag: "na1", signature: "data:image/png;base64,signature" };

  it("announces every signed player-card copy after the successful mint", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    signedPullIndexes.add(2);
    const shop = createShop({ signatures: [playerSignature], profile: { username: "Patron", patron_until: "2099-01-01T00:00:00.000Z" } });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    expect(result.ok && result.cards.filter((pull) => pull.signed)).toHaveLength(2);
    expect(postCardsWebhook).not.toHaveBeenCalled();
    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(2);
    for (const [embed] of postCardsWebhook.mock.calls) {
      expect(embed).toMatchObject({ title: "✍️ A SIGNATURE HAS BEEN PULLED" });
      expect(embed.description).toContain("🔥 Patron");
      expect(embed.description).toContain("Doug");
      expect(embed.description).toContain("WK Aug 24 edition");
      expect(embed.description).toContain("Gold Mid");
      expect(embed.description).toContain("Prisma");
      expect(embed.description).toContain("Signed");
    }
    expect(insertedCards(shop.calls).filter((card) => card.autograph)).toHaveLength(2);
  });

  it("keeps a signed Secret on its single existing announcement", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    rollPackFinishes.mockReturnValueOnce([
      { shiny: false, stattrak: false, secret: true },
      ...Array.from({ length: 4 }, () => ({ shiny: false, stattrak: false, secret: false })),
    ]);
    createShop({ signatures: [playerSignature] });

    await openPackFor("42", "premier");

    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining("SECRET") });
  });

  it("keeps a signed Eclipse on its single existing announcement", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    rollEclipseCandidates.mockReturnValueOnce([0]);
    createShop({ signatures: [playerSignature] });

    await openPackFor("42", "premier");

    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook.mock.calls[0][0]).toMatchObject({ title: expect.stringContaining("ECLIPSE") });
  });

  it("does not announce a signed pull when fulfillment fails or is recovered", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    createShop({ signatures: [playerSignature], insertError: { message: "insert exploded" } });

    expect((await openPackFor("42", "premier")).ok).toBe(false);
    expect(postCardsWebhook).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("does not announce a recovered/replayed opening", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    createShop({ signatures: [playerSignature], replayFulfillment: true });

    expect((await openPackFor("42", "premier")).ok).toBe(true);
    expect(postCardsWebhook).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("falls back safely when the collector profile is unavailable", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    createShop({ signatures: [playerSignature], profileError: { message: "profile unavailable" } });

    expect((await openPackFor("42", "academy")).ok).toBe(true);
    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook.mock.calls[0][0].description).toContain("Someone");
    expect(postCardsWebhook.mock.calls[0][0].description).toContain("Doug");
  });

  it("leaves the opening successful when Discord delivery rejects", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    createShop({ signatures: [playerSignature] });
    postCardsWebhook.mockRejectedValue(new Error("discord is down"));

    expect((await openPackFor("42", "premier")).ok).toBe(true);
    await drainAfterCallbacks();
  });

  it("returns the committed opening before a stalled announcement is drained", async () => {
    signedSlugs.add("doug-na1");
    signedPullIndexes.add(0);
    createShop({ signatures: [playerSignature] });
    postCardsWebhook.mockImplementation(() => new Promise<void>(() => {}));

    expect((await openPackFor("42", "premier")).ok).toBe(true);
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });
});

describe("Champions signature announcements", () => {
  it("announces a signed relic without OVR or edition claims", async () => {
    const shop = createShop({
      championSignature: { summoner_name: "KingOfSpades", tag: "205", signature: "data:image/png;base64,signature", season: "S4" },
      profile: { username: "Patron", patron_until: "2099-01-01T00:00:00.000Z" },
    });

    const result = await openChampionsPack("42");

    expect(result.ok).toBe(true);
    expect(result.ok && result.cards[0].signed).toBe(true);
    expect(postCardsWebhook).not.toHaveBeenCalled();
    await drainAfterCallbacks();
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    const embed = postCardsWebhook.mock.calls[0][0] as { title: string; description: string };
    expect(embed.title).toBe("✍️ A SIGNATURE HAS BEEN PULLED");
    expect(embed.description).toContain("🔥 Patron");
    expect(embed.description).toContain("king of spades");
    expect(embed.description).toContain("Cho'Gath");
    expect(embed.description).toContain("The Hand 1 of 5");
    expect(embed.description).toContain("Champion relic");
    expect(embed.description).toContain("Prisma");
    expect(embed.description).toContain("Signed");
    expect(embed.description).not.toContain("OVR");
    expect(embed.description).not.toContain("edition");
    expect(stampedOpenIds(shop.calls)).toEqual([88]);
  });
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
  it("recovers the committed cards when a concurrent retry already fulfilled the opening", async () => {
    const shop = createShop({ replayFulfillment: true });

    const result = await openPackFor("42", "premier");

    expect(result).toMatchObject({
      ok: true,
      openingId: "opening-1",
      variant: "standard",
      revealOrder: [501, 502, 503, 504, 505],
    });
    expect(result.ok && result.cards.map((pull) => pull.inventoryId)).toEqual([501, 502, 503, 504, 505]);
    expect(shop.rpc).not.toHaveBeenCalledWith("refund_card_pack_opening", expect.anything());
  });

  it("spends a standard comp instead of charging, and says how many are left", async () => {
    const shop = createShop({ comps: { standard: 1 } });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ compsLeft: 0 });
    // The charge never happened...
    expect(shop.rpc).not.toHaveBeenCalledWith("open_card_pack", expect.anything());
    // ...so the cards belong to no paid open, exactly like a comped
    // Faceless Pack.
    expect(stampedOpenIds(shop.calls)).toEqual([null, null, null, null, null]);
    expect(shop.table.rows.get("standard")).toBe(0);
  });

  it("charges as usual when no comp is held", async () => {
    const shop = createShop({ comps: { standard: 0 } });

    const result = await openPackFor("42", "premier");

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty("compsLeft");
    expect(shop.rpc).toHaveBeenCalledWith("open_card_pack", { p_user: "42", p_season: "s4", p_cost: 200 });
    expect(stampedOpenIds(shop.calls)).toEqual([77, 77, 77, 77, 77]);
  });

  it("never spends a comp on the free daily rip", async () => {
    const shop = createShop({ comps: { standard: 1 } });

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
    const shop = createShop({ comps: { standard: 1 }, insertError: { message: "insert exploded" }, refundError: { message: "restore exploded" } });
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
