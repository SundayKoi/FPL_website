import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "@/lib/cards/build";

// runs.ts is `import "server-only"` — vitest resolves that package's default
// export condition (which throws by design) rather than the "react-server"
// one Next.js's bundler uses. Stub it so the module can load, same as
// packs/open.test.ts.
vi.mock("server-only", () => ({}));

const { createBettingServiceClient } = vi.hoisted(() => ({ createBettingServiceClient: vi.fn() }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));

const { postCardsWebhook } = vi.hoisted(() => ({ postCardsWebhook: vi.fn() }));
vi.mock("@/lib/packs/announce", () => ({ postCardsWebhook, GOLD: 0xe8c14b }));

// The CSPRNG itself, scripted. Mocking node:crypto rather than injecting a
// rand keeps the module under test on the exact production line
// (`randomBytes(6).readUIntBE(0, 6) / 2 ** 48`) — a refactor that reached
// for Math.random would turn this suite red instead of quietly weakening
// a roll that pays real betting dollars.
const { randomBytes } = vi.hoisted(() => ({ randomBytes: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  // The `default` half matters as much as the named one: node:crypto is a
  // CJS builtin, so Vite's SSR interop reads named imports back off the
  // default export — a mock that only replaced the named `randomBytes`
  // would load clean and then quietly hand runs.ts the real one.
  return { ...actual, randomBytes, default: { ...actual, randomBytes } };
});

const { claimExpeditionFor, friendlyExpeditionError, launchExpeditionFor } = await import("./runs");

/** A six-byte buffer that `readUIntBE(0, 6) / 2 ** 48` reads back as `value`. */
function randBuffer(value: number): Buffer {
  const buffer = Buffer.alloc(6);
  buffer.writeUIntBE(Math.min(2 ** 48 - 1, Math.max(0, Math.floor(value * 2 ** 48))), 0, 6);
  return buffer;
}

/** Script the next draws, in [0,1). Anything drawn past the end of the
 *  queue reads 0.5. */
function scriptRand(...values: number[]): void {
  randomBytes.mockReturnValue(randBuffer(0.5));
  for (const value of values) randomBytes.mockReturnValueOnce(randBuffer(value));
}

type QueryCall = {
  table: string;
  verb: "select" | "insert" | "update";
  payload?: unknown;
  filters: Record<string, unknown>;
};

type QueryResult = { data: unknown; error: unknown; count: number | null };
type Respond = (call: QueryCall) => { data?: unknown; error?: unknown; count?: number };

/** A chainable, awaitable PostgREST stand-in — packs/open.test.ts's helper,
 *  plus the `.in()` the by-ids copies read needs. */
function createService(respond: Respond) {
  const calls: QueryCall[] = [];
  const rpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, verb: "select", filters: {} };
    calls.push(call);
    const settle = (): QueryResult => {
      const result = respond(call) ?? {};
      return { data: result.data ?? null, error: result.error ?? null, count: result.count ?? null };
    };
    const builder = {
      select: () => builder,
      insert: (payload: unknown) => {
        call.verb = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        call.verb = "update";
        call.payload = payload;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      in: (column: string, values: unknown) => {
        call.filters[column] = values;
        return builder;
      },
      is: (column: string, value: unknown) => {
        call.filters[column] = value;
        return builder;
      },
      not: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => settle(),
      single: async () => settle(),
      then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(settle()).then(resolve, reject),
    };
    return builder;
  });
  const client = { from, rpc } as unknown as SupabaseClient;
  return { client, calls, rpc, from };
}

interface CopySpec {
  id: number;
  tier?: string;
  role?: string;
  foil?: boolean;
  foilType?: string | null;
  signed?: boolean;
  season?: string;
}

/** One `card_inventory` row, as PostgREST hands it over. */
function copyRow(spec: CopySpec) {
  return {
    id: spec.id,
    season: spec.season ?? "s4",
    slug: `doug-${spec.id}`,
    player_name: `Doug ${spec.id}`,
    role: spec.role ?? "Mid",
    edition_week: "2026-08-24",
    overall: 80,
    tier: spec.tier ?? "gold",
    foil: spec.foil ?? false,
    foil_type: spec.foilType ?? null,
    signed: spec.signed ?? false,
    card: { slug: `doug-${spec.id}`, name: `Doug ${spec.id}` } as unknown as PlayerCardData,
    pack_open_id: null,
    acquired_at: "2026-08-24T00:00:00.000Z",
  };
}

interface RunSpec {
  id?: number;
  tier?: string;
  squad?: number[];
  shine?: number;
  startedAt?: string;
  resolvesAt?: string;
  claimedAt?: string | null;
}

function runRow(spec: RunSpec = {}) {
  return {
    id: spec.id ?? 9,
    discord_id: "42",
    season: "s4",
    tier: spec.tier ?? "scout",
    squad: spec.squad ?? [1, 2, 3],
    shine: spec.shine ?? 9,
    started_at: spec.startedAt ?? "2026-08-27T18:00:00.000Z",
    resolves_at: spec.resolvesAt ?? "2026-08-28T02:00:00.000Z",
    outcome: null,
    claimed_at: spec.claimedAt ?? null,
  };
}

/** The two reads every flow makes, answered the boring way. */
function createBoard(
  opts: {
    copies?: ReturnType<typeof copyRow>[];
    run?: ReturnType<typeof runRow> | null;
    copiesError?: unknown;
    runError?: unknown;
  } = {},
) {
  const service = createService((call) => {
    if (call.table === "card_inventory") {
      if (opts.copiesError) return { data: null, error: opts.copiesError };
      const wanted = (call.filters.id as number[]) ?? [];
      return { data: (opts.copies ?? []).filter((row) => wanted.includes(row.id)) };
    }
    if (call.table === "expedition_runs") {
      if (opts.runError) return { data: null, error: opts.runError };
      return { data: opts.run ?? null };
    }
    return { data: null };
  });
  createBettingServiceClient.mockReturnValue(service.client);
  return service;
}

/** Three plain golds: shine 9, enough for a Scouting Run and nothing else. */
const scoutSquad = [copyRow({ id: 1 }), copyRow({ id: 2 }), copyRow({ id: 3 })];

beforeEach(() => {
  createBettingServiceClient.mockReset();
  postCardsWebhook.mockReset();
  randomBytes.mockReset();
  scriptRand();
  // Claim day is the 28th; every run below launched on the 27th, so the two
  // days' briefs are never the same one.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-28T18:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("friendlyExpeditionError", () => {
  it("translates every exception the RPCs raise", () => {
    expect(friendlyExpeditionError("unknown tier")).toBe("That expedition doesn't exist.");
    expect(friendlyExpeditionError("bad duration")).toBe("That expedition's length isn't valid.");
    expect(friendlyExpeditionError("squad must be three distinct cards")).toBe(
      "An expedition takes exactly three different cards.",
    );
    expect(friendlyExpeditionError("unknown user 42")).toBe("Account not found — try signing in again.");
    expect(friendlyExpeditionError("daily expedition limit")).toBe(
      "You've sent out every expedition you get today — come back tomorrow.",
    );
    expect(friendlyExpeditionError("card not owned")).toBe("Those cards aren't yours.");
    expect(friendlyExpeditionError("card already deployed")).toBe(
      "One of those cards is already out on an expedition.",
    );
    expect(friendlyExpeditionError("card is on expedition")).toBe(
      "One of those cards is already out on an expedition.",
    );
    expect(friendlyExpeditionError("already claimed")).toBe("That expedition has already been claimed.");
    expect(friendlyExpeditionError("expedition still out")).toBe("That squad is still out — check back soon.");
    expect(friendlyExpeditionError("unknown run")).toBe("That expedition no longer exists.");
  });

  it("never surfaces a raw Postgres error", () => {
    expect(friendlyExpeditionError("bearer not in squad")).toBe("Something went wrong with that expedition.");
    expect(friendlyExpeditionError('null value in column "shine" violates not-null constraint')).toBe(
      "Something went wrong with that expedition.",
    );
  });
});

describe("launchExpeditionFor", () => {
  it("refuses a squad that isn't three distinct cards without touching the database", async () => {
    const board = createBoard({ copies: scoutSquad });

    expect(await launchExpeditionFor("42", "scout", [1, 2])).toEqual({
      ok: false,
      error: "An expedition takes exactly three different cards.",
    });
    expect(await launchExpeditionFor("42", "scout", [1, 2, 2])).toEqual({
      ok: false,
      error: "An expedition takes exactly three different cards.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
    expect(board.from).not.toHaveBeenCalled();
  });

  it("refuses an unknown tier", async () => {
    const board = createBoard({ copies: scoutSquad });

    expect(await launchExpeditionFor("42", "crusade" as "scout", [1, 2, 3])).toEqual({
      ok: false,
      error: "That expedition doesn't exist.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses cards the caller doesn't own, and looks them up as that owner", async () => {
    const board = createBoard({ copies: [copyRow({ id: 1 }), copyRow({ id: 2 })] });

    expect(await launchExpeditionFor("42", "scout", [1, 2, 3])).toEqual({
      ok: false,
      error: "Those cards aren't yours.",
    });
    expect(board.calls[0].filters.discord_id).toBe("42");
    expect(board.calls[0].filters.id).toEqual([1, 2, 3]);
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses a squad drawn from two leagues", async () => {
    const board = createBoard({
      copies: [copyRow({ id: 1 }), copyRow({ id: 2 }), copyRow({ id: 3, season: "s4-academy" })],
    });

    expect(await launchExpeditionFor("42", "scout", [1, 2, 3])).toEqual({
      ok: false,
      error: "Squad cards must come from one league.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses a squad the tier's gate rejects, saying every reason, and never calls the RPC", async () => {
    const board = createBoard({ copies: scoutSquad });

    const result = await launchExpeditionFor("42", "legend", [1, 2, 3]);

    expect(result.ok).toBe(false);
    const error = result.ok ? "" : result.error;
    expect(error).toContain("needs 2 foil cards — this squad has 0.");
    expect(error).toContain("needs 1 signed card — this squad has 0.");
    expect(error).toContain("needs 20 shine — this squad has 9.");
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("launches with the tier's hours, the squad's shine, and the copies' season", async () => {
    const board = createBoard({ copies: scoutSquad });
    board.rpc.mockResolvedValue({ data: [{ run_id: 7, resolves_at: "2026-08-29T02:00:00.000Z" }], error: null });

    const result = await launchExpeditionFor("42", "scout", [1, 2, 3]);

    expect(result).toEqual({ ok: true, runId: 7, resolvesAt: "2026-08-29T02:00:00.000Z" });
    expect(board.rpc).toHaveBeenCalledWith("launch_expedition", {
      p_user: "42",
      p_season: "s4",
      p_tier: "scout",
      p_squad: [1, 2, 3],
      p_shine: 9,
      p_hours: 8,
    });
  });

  it("sends the shine the squad actually carries, cosmetics included", async () => {
    // A signed Cracked Ice diamond (6 + 4 + 4), a plain diamond (6) and a
    // Prisma diamond (6 + 1).
    const board = createBoard({
      copies: [
        copyRow({ id: 1, tier: "diamond", foil: true, foilType: "ice", signed: true }),
        copyRow({ id: 2, tier: "diamond" }),
        copyRow({ id: 3, tier: "diamond", foil: true, foilType: "prisma" }),
      ],
    });
    board.rpc.mockResolvedValue({ data: [{ run_id: 8, resolves_at: "2026-08-29T18:00:00.000Z" }], error: null });

    await launchExpeditionFor("42", "raid", [1, 2, 3]);

    expect(board.rpc).toHaveBeenCalledWith(
      "launch_expedition",
      expect.objectContaining({ p_shine: 14 + 6 + 7, p_hours: 24, p_tier: "raid" }),
    );
  });

  it("translates the RPC's exception rather than leaking it", async () => {
    const board = createBoard({ copies: scoutSquad });
    board.rpc.mockResolvedValue({ data: null, error: { message: "card already deployed" } });

    expect(await launchExpeditionFor("42", "scout", [1, 2, 3])).toEqual({
      ok: false,
      error: "One of those cards is already out on an expedition.",
    });
  });

  it("stops at the collection read when it fails, rather than launching blind", async () => {
    const board = createBoard({ copiesError: { message: "boom" } });

    expect(await launchExpeditionFor("42", "scout", [1, 2, 3])).toEqual({
      ok: false,
      error: "Those cards aren't yours.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });
});

describe("claimExpeditionFor", () => {
  it("refuses a run that is still out, before the RPC sees it", async () => {
    const board = createBoard({
      copies: scoutSquad,
      run: runRow({ resolvesAt: "2026-08-29T02:00:00.000Z" }),
    });

    expect(await claimExpeditionFor("42", 9)).toEqual({
      ok: false,
      error: "That squad is still out — check back soon.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses a run already claimed", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow({ claimedAt: "2026-08-28T03:00:00.000Z" }) });

    expect(await claimExpeditionFor("42", 9)).toEqual({
      ok: false,
      error: "That expedition has already been claimed.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses a run that isn't there", async () => {
    const board = createBoard({ copies: scoutSquad, run: null });

    expect(await claimExpeditionFor("42", 9)).toEqual({ ok: false, error: "That expedition no longer exists." });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("still surfaces the RPC's re-check when two claims race", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow() });
    board.rpc.mockResolvedValue({ data: null, error: { message: "already claimed" } });

    expect(await claimExpeditionFor("42", 9)).toEqual({
      ok: false,
      error: "That expedition has already been claimed.",
    });
    expect(board.rpc).toHaveBeenCalled();
  });

  it("rolls the outcome off the CSPRNG and banks it", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow() });
    board.rpc.mockResolvedValue({ data: [{ balance: 1519 }], error: null });
    // One draw: a scouting run that rolls poor has neither a comp chance
    // nor a mark chance to spend a second on.
    scriptRand(0);

    const result = await claimExpeditionFor("42", 9);

    // 15 base x (1 + 0.03 x 9 shine over a zero gate) = 19.05 -> 19.
    expect(result).toEqual({
      ok: true,
      outcome: { grade: "poor", dollars: 19, comp: false, mark: null, briefHit: false },
      bearerId: null,
      balance: 1519,
    });
    expect(board.rpc).toHaveBeenCalledWith("claim_expedition", {
      p_user: "42",
      p_run: 9,
      p_grade: "poor",
      p_dollars: 19,
      p_comp: false,
      p_mark: null,
      p_bearer: null,
    });
    expect(randomBytes).toHaveBeenCalledWith(6);
  });

  it("pays the LAUNCH day's brief, not the day the squad happened to come home", async () => {
    // 2026-08-27 (ET) briefs the jungle; 2026-08-28 briefs the middle. A
    // squad of mids launched on the 27th picked against the jungle brief
    // and missed it — claiming on the 28th must not retroactively pay them.
    const board = createBoard({ copies: scoutSquad, run: runRow() });
    board.rpc.mockResolvedValue({ data: [{ balance: 100 }], error: null });
    scriptRand(0);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ outcome: { briefHit: false, dollars: 19 } });

    // The same squad launched on a day that DOES brief the middle keeps the
    // bonus: 15 x 1.27 x 1.2 = 22.86 -> 23.
    const later = createBoard({ copies: scoutSquad, run: runRow({ startedAt: "2026-08-28T14:00:00.000Z" }) });
    later.rpc.mockResolvedValue({ data: [{ balance: 100 }], error: null });
    scriptRand(0);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ outcome: { briefHit: true, dollars: 23 } });
  });

  it("reads the launch day in Eastern time, not UTC", async () => {
    // 2026-08-28T02:00Z is still the 27th in New York, and the 27th briefs
    // the jungle — a UTC read would call it the 28th and pay the mids.
    const board = createBoard({ copies: scoutSquad, run: runRow({ startedAt: "2026-08-28T02:00:00.000Z" }) });
    board.rpc.mockResolvedValue({ data: [{ balance: 100 }], error: null });
    scriptRand(0);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ outcome: { briefHit: false } });
  });

  it("picks the bearer out of the squad when a mark drops, and announces a legend jackpot", async () => {
    const legendSquad = [
      copyRow({ id: 11, tier: "challenger", foil: true, foilType: "ice", signed: true }),
      copyRow({ id: 12, tier: "challenger", foil: true, foilType: "ice" }),
      copyRow({ id: 13, tier: "challenger" }),
    ];
    const board = createBoard({
      copies: legendSquad,
      run: runRow({ tier: "legend", squad: [11, 12, 13], shine: 30 }),
    });
    board.rpc.mockResolvedValue({ data: [{ balance: 5000 }], error: null });
    // grade -> jackpot; comp -> hit (0.6); the legend mark is certain, so
    // it never draws; then the bearer pick lands on the middle card.
    scriptRand(0.9, 0.1, 0.5);

    const result = await claimExpeditionFor("42", 9);

    // 400 base x (1 + 0.03 x 10 shine over legend's gate of 20) = 520.
    expect(result).toEqual({
      ok: true,
      outcome: { grade: "jackpot", dollars: 520, comp: true, mark: "legend", briefHit: false },
      bearerId: 12,
      balance: 5000,
    });
    expect(board.rpc).toHaveBeenCalledWith(
      "claim_expedition",
      expect.objectContaining({ p_mark: "legend", p_bearer: 12, p_comp: true, p_dollars: 520 }),
    );
    expect(postCardsWebhook).toHaveBeenCalledWith({
      title: "Legend Hunt — jackpot",
      description:
        "<@42>'s Legend Hunt struck gold: 520 dollars, a free pack, and a card came back wearing the Legend Finish.",
      color: 0xe8c14b,
    });
  });

  it("spreads the bearer across the whole squad", async () => {
    for (const [draw, expected] of [
      [0, 11],
      [0.4, 12],
      [0.99, 13],
    ] as const) {
      const board = createBoard({
        copies: [copyRow({ id: 11 }), copyRow({ id: 12 }), copyRow({ id: 13 })],
        run: runRow({ tier: "legend", squad: [11, 12, 13], shine: 20 }),
      });
      board.rpc.mockResolvedValue({ data: [{ balance: 1 }], error: null });
      scriptRand(0.9, 0.9, draw);

      expect(await claimExpeditionFor("42", 9)).toMatchObject({ bearerId: expected });
    }
  });

  it("keeps quiet about a legend run that didn't jackpot", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow({ tier: "legend", shine: 20 }) });
    board.rpc.mockResolvedValue({ data: [{ balance: 400 }], error: null });
    // grade -> solid; comp (0.15) -> missed; a legend solid can't mark.
    scriptRand(0.5, 0.9);

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ outcome: { grade: "solid", mark: null }, bearerId: null });
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });

  it("keeps quiet about a jackpot that wasn't a Legend Hunt", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow({ tier: "scout" }) });
    board.rpc.mockResolvedValue({ data: [{ balance: 400 }], error: null });
    // grade -> jackpot; the 8% trail mark misses.
    scriptRand(0.99, 0.9);

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ outcome: { grade: "jackpot", mark: null } });
    expect(postCardsWebhook).not.toHaveBeenCalled();
  });

  it("never lets a webhook outage swallow a paid claim", async () => {
    const board = createBoard({
      copies: [copyRow({ id: 1 }), copyRow({ id: 2 }), copyRow({ id: 3 })],
      run: runRow({ tier: "legend", shine: 20 }),
    });
    board.rpc.mockResolvedValue({ data: [{ balance: 900 }], error: null });
    postCardsWebhook.mockRejectedValue(new Error("discord is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    scriptRand(0.9, 0.1, 0.5);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ ok: true, balance: 900 });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
