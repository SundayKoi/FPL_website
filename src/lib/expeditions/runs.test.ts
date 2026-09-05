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
vi.mock("@/lib/packs/announce", () => ({ postCardsWebhook, GOLD: 0xe8c14b, LIVE_RED: 0xff5063 }));

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

const { claimExpeditionFor, decideForkFor, friendlyExpeditionError, launchExpeditionFor, ransomLostCardFor, sweepExpeditions } =
  await import("./runs");

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
      gt: (column: string, value: unknown) => {
        call.filters[`${column}>`] = value;
        return builder;
      },
      gte: (column: string, value: unknown) => {
        call.filters[`${column}>=`] = value;
        return builder;
      },
      neq: (column: string, value: unknown) => {
        call.filters[`${column}!=`] = value;
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
  forks?: number;
  choices?: { index: number; choice: string; at: string }[];
  pinged?: number;
  rules?: number;
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
    // Forks are exercised in routes.test.ts; these runs have none, so the
    // route consumes no rand and the scripted draws below stay readable.
    forks: spec.forks ?? 0,
    choices: spec.choices ?? [],
    insured: false,
    target: null,
    fee: 0,
    encounters: [],
    pinged: spec.pinged ?? 0,
    rules: spec.rules ?? 2,
  };
}

/** The two reads every flow makes, answered the boring way. */
function createBoard(
  opts: {
    copies?: ReturnType<typeof copyRow>[];
    run?: ReturnType<typeof runRow> | null;
    copiesError?: unknown;
    runError?: unknown;
    /** The league calendar, as the fixtures table hands it over. */
    fixtures?: { team_a: string | null; team_b: string | null; scheduled_at: string | null }[];
    /** The archived edition a moment's echo mints from. */
    editions?: { card: PlayerCardData }[];
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
    if (call.table === "fixtures") return { data: opts.fixtures ?? [] };
    if (call.table === "card_editions") return { data: opts.editions ?? [] };
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
    // A distinct sentence from the day limit on purpose: one sends you to
    // another tier, the other sends you to bed.
    expect(friendlyExpeditionError("tier already out")).toBe(
      "That expedition is already out — bring it home before you send another.",
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

  it("tells a player NOT to retry a payout the guard refused", () => {
    // The one exception a player cannot have caused, and the one where
    // "try again" is actively harmful: nothing was written, so the run is
    // still claimable — but rollOutcome re-rolls on every attempt, so a
    // retry pays a lower grade and closes it. This message exists because
    // a real Legend Hunt jackpot was refused as a generic error, and the
    // obvious response to a generic error is to click again.
    const message = friendlyExpeditionError("payout out of range");
    expect(message).toContain("don't retry");
    expect(message).not.toBe("Something went wrong with that expedition.");
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

    expect(result).toEqual({ ok: true, runId: 7, resolvesAt: "2026-08-29T02:00:00.000Z", fee: 0, freePolicy: false });
    expect(board.rpc).toHaveBeenCalledWith("launch_expedition", {
      p_user: "42",
      p_season: "s4",
      p_tier: "scout",
      p_squad: [1, 2, 3],
      p_shine: 9,
      p_hours: 8,
      p_forks: 1,
      p_insured: false,
      p_fee: 0,
      p_fragments: 0,
      p_target: null,
      p_policy_week: null,
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
      expect.objectContaining({ p_shine: 14 + 6 + 7, p_hours: 24, p_tier: "raid", p_forks: 2 }),
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

  it("refuses to roll when the squad can't be read back, leaving the run claimable", async () => {
    // A deployed copy can't be melted or traded (the trigger refuses), so a
    // short read is always a failed query — and rolling on an empty squad
    // would silently drop the brief bonus off a real payout.
    const board = createBoard({ copiesError: { message: "boom" }, run: runRow() });

    expect(await claimExpeditionFor("42", 9)).toEqual({
      ok: false,
      error: "Couldn't read the squad — try the claim again.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("refuses on a squad that came back short, not just on a hard error", async () => {
    const board = createBoard({ copies: [copyRow({ id: 1 }), copyRow({ id: 2 })], run: runRow() });

    expect(await claimExpeditionFor("42", 9)).toEqual({
      ok: false,
      error: "Couldn't read the squad — try the claim again.",
    });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("rolls the outcome off the CSPRNG and banks it", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow() });
    board.rpc.mockResolvedValue({ data: [{ balance: 1519, fragments: 0 }], error: null });
    // One draw: a scouting run that rolls poor has neither a comp chance
    // nor a mark chance to spend a second on, and a silent fork rolls
    // nothing.
    scriptRand(0);

    const result = await claimExpeditionFor("42", 9);

    // 40 base x (1 + 0.03 x 9 shine over a zero gate) = 50.8 -> 51.
    expect(result).toMatchObject({
      ok: true,
      outcome: { grade: "poor", dollars: 51, comp: false, mark: null, briefHit: false },
      bearerId: null,
      balance: 1519,
      fragments: 0,
      baseDollars: 51,
      route: { lootMultiplier: 1, pushes: 0, silences: 0, fragments: 0 },
    });
    expect(board.rpc).toHaveBeenCalledWith("resolve_expedition", {
      p_user: "42",
      p_run: 9,
      p_outcome: expect.objectContaining({
        grade: "poor",
        dollars: 51,
        comp: false,
        mark: null,
        bearer: null,
        lootMultiplier: 1,
        fates: [
          { id: 1, fate: "home", mutation: null },
          { id: 2, fate: "home", mutation: null },
          { id: 3, fate: "home", mutation: null },
        ],
      }),
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

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ outcome: { briefHit: false, dollars: 51 } });

    // The same squad launched on a day that DOES brief the middle keeps the
    // bonus: 40 x 1.27 x 1.2 = 60.96 -> 61.
    const later = createBoard({ copies: scoutSquad, run: runRow({ startedAt: "2026-08-28T14:00:00.000Z" }) });
    later.rpc.mockResolvedValue({ data: [{ balance: 100 }], error: null });
    scriptRand(0);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ outcome: { briefHit: true, dollars: 61 } });
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
    // grade -> jackpot; comp -> hit (0.75); the legend mark is certain, so
    // it never draws; then the bearer pick lands on the middle card.
    scriptRand(0.9, 0.1, 0.5);

    const result = await claimExpeditionFor("42", 9);

    // 2000 base x (1 + 0.03 x 10 shine over legend's gate of 20) = 2600.
    expect(result).toMatchObject({
      ok: true,
      outcome: { grade: "jackpot", dollars: 2600, comp: true, mark: "legend", briefHit: false },
      bearerId: 12,
      balance: 5000,
      // A legend jackpot always carries a map fragment home.
      route: { fragments: 1 },
    });
    expect(board.rpc).toHaveBeenCalledWith(
      "resolve_expedition",
      expect.objectContaining({
        p_outcome: expect.objectContaining({ mark: "legend", bearer: 12, comp: true, dollars: 2600 }),
      }),
    );
    expect(postCardsWebhook).toHaveBeenCalledWith({
      title: "Legend Hunt — jackpot",
      description:
        "<@42>'s Legend Hunt struck gold: 2600 dollars, a free pack, and a card came back wearing the Legend Finish.",
      color: 0xe8c14b,
    });
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
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
    // grade -> solid; comp (0.25) -> missed; a legend solid can't mark.
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

describe("decideForkFor", () => {
  // A 24h raid with two forks, launched nine hours ago: the first fork
  // (8h) is open until 16h, the second (16h) is still ahead.
  const atFork = () => runRow({ tier: "raid", forks: 2, startedAt: "2026-08-28T09:00:00.000Z", resolvesAt: "2026-08-29T09:00:00.000Z" });

  it("records a push at the open fork through the RPC", async () => {
    const board = createBoard({ copies: scoutSquad, run: atFork() });
    board.rpc.mockResolvedValue({ data: [{ closes_at: "2026-08-29T01:00:00.000Z" }], error: null });

    expect(await decideForkFor("42", 9, 0, "push")).toEqual({ ok: true, closesAt: "2026-08-29T01:00:00.000Z" });
    expect(board.rpc).toHaveBeenCalledWith("decide_expedition_fork", { p_user: "42", p_run: 9, p_index: 0, p_choice: "push" });
  });

  it("refuses a choice the squad cannot make, before the RPC", async () => {
    const board = createBoard({ copies: scoutSquad, run: atFork() });

    expect(await decideForkFor("42", 9, 0, "favour")).toEqual({ ok: false, error: "This squad can't make that choice here." });
    expect(board.rpc).not.toHaveBeenCalled();
  });

  it("names a fork that is not open yet, and one already answered", async () => {
    const board = createBoard({ copies: scoutSquad, run: atFork() });
    expect(await decideForkFor("42", 9, 1, "camp")).toMatchObject({ ok: false, error: "The squad hasn't reached that fork yet." });
    const answered = createBoard({
      copies: scoutSquad,
      run: runRow({ ...atFork(), choices: [{ index: 0, choice: "camp", at: "" }] }),
    });
    expect(await decideForkFor("42", 9, 0, "push")).toMatchObject({ ok: false, error: "That fork has already been answered." });
    expect(board.rpc).not.toHaveBeenCalled();
    expect(answered.rpc).not.toHaveBeenCalled();
  });
});

describe("claimExpeditionFor — the route", () => {
  it("multiplies the base by what the forks earned and hands every fate to the RPC", async () => {
    // A raid pushed at both forks. Base roll: grade solid (0.5), comp
    // (0, chance 0 -> no draw on solid), sigil mark 0.1 chance -> 0.9 miss.
    // Then no bearer draw. Route: fork 0 push: victim 0.5 -> card 2,
    // wounded 0.99 miss, reward pick 0 -> card 1, 0.1 hit (irradiated).
    // Fork 1 push: victim 0.99 -> card 3, wounded 0.1 hit; reward pick 0.5
    // over [2,3] -> 3, 0.99 miss. Fragments: raid solid has no chance.
    const board = createBoard({
      copies: scoutSquad,
      run: runRow({
        tier: "raid", shine: 12, forks: 2,
        choices: [{ index: 0, choice: "push", at: "" }, { index: 1, choice: "push", at: "" }],
      }),
    });
    board.rpc.mockResolvedValue({ data: [{ balance: 700, fragments: 0 }], error: null });
    scriptRand(0.5, 0.9, 0.5, 0.99, 0, 0.1, 0.99, 0.1, 0.5, 0.99);

    const result = await claimExpeditionFor("42", 9);

    // 260 base, shine 12 on a gate of 12 -> no bonus; x1.5 from two pushes
    // = 390, plus the merchant this run's journal happens to carry (run 9,
    // seeded): the flat rides on top of the multiplied dollars.
    expect(result).toMatchObject({
      ok: true,
      baseDollars: 260,
      merchant: 75,
      stranded: null,
      outcome: { dollars: 465 },
      route: { lootMultiplier: 1.5, pushes: 2 },
    });
    expect(board.rpc).toHaveBeenCalledWith(
      "resolve_expedition",
      expect.objectContaining({
        p_outcome: expect.objectContaining({
          dollars: 465,
          merchant: 75,
          fates: [
            { id: 1, fate: "home", mutation: "irradiated" },
            { id: 2, fate: "home", mutation: null },
            { id: 3, fate: "wounded", mutation: null, until: expect.any(String) },
          ],
        }),
      }),
    );
  });

  it("announces a card that came home Voidtouched, and one that did not come home", async () => {
    // A Legendary route with no forks (a scripted finale): base jackpot
    // (0.9), comp certain (no draw), mark certain (no draw), bearer 0 ->
    // card 1. Route: first voidtouched pick 0.5 -> card 2; second 0.99 miss.
    const board = createBoard({ copies: scoutSquad, run: runRow({ tier: "legendary", shine: 30, forks: 0 }) });
    board.rpc.mockResolvedValue({ data: [{ balance: 9000, fragments: 0 }], error: null });
    scriptRand(0.9, 0, 0.5, 0.99);

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ ok: true, route: { fates: expect.arrayContaining([{ id: 2, fate: "home", mutation: "voidtouched", woundedUntil: null }]) } });
    expect(postCardsWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Back from the Legendary route — Voidtouched", description: expect.stringContaining("Doug 2") }),
    );
  });
});

describe("ransomLostCardFor", () => {
  it("prices the ransom off the card and releases the hold", async () => {
    const board = createBoard({ copies: [copyRow({ id: 1 })], run: runRow({ id: 77, tier: "lost", squad: [1] }) });
    board.rpc.mockResolvedValue({ data: [{ balance: 580 }], error: null });

    // 300 + 40 x 3 shine (a plain gold).
    expect(await ransomLostCardFor("42", 77)).toEqual({ ok: true, balance: 580, paid: 420 });
    expect(board.rpc).toHaveBeenCalledWith("ransom_lost_card", { p_user: "42", p_hold: 77, p_dollars: 420 });
  });

  it("refuses a run that is not a hold", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow({ id: 9, tier: "raid" }) });
    expect(await ransomLostCardFor("42", 9)).toEqual({ ok: false, error: "That card isn't lost — or it's already home." });
    expect(board.rpc).not.toHaveBeenCalled();
  });
});

describe("sweepExpeditions", () => {
  it("buries the overdue, pings each fork once, and says so with a real mention", async () => {
    const service = createService((call) => {
      if (call.table === "expedition_runs" && call.verb === "select") {
        return {
          data: [
            // Open fork, never pinged: gets the ping.
            runRow({ id: 1, tier: "raid", forks: 2, startedAt: "2026-08-28T09:00:00.000Z", resolvesAt: "2026-08-29T09:00:00.000Z" }),
            // Same, already pinged for fork 0: silent.
            runRow({ id: 2, tier: "raid", forks: 2, startedAt: "2026-08-28T09:00:00.000Z", resolvesAt: "2026-08-29T09:00:00.000Z", pinged: 1 }),
            // Not at a fork yet.
            runRow({ id: 3, tier: "legend", forks: 3, startedAt: "2026-08-28T17:00:00.000Z", resolvesAt: "2026-08-30T17:00:00.000Z" }),
          ],
        };
      }
      return { data: null };
    });
    service.rpc.mockResolvedValue({ data: 2, error: null });
    createBettingServiceClient.mockReturnValue(service.client);

    const result = await sweepExpeditions(new Date("2026-08-28T18:00:00.000Z"));

    // Runs 1 and 2 both carry a storm on their first leg (seeded), and the
    // sweep is past its hour: each is delayed once through the RPC.
    expect(result).toEqual({ pinged: 1, buried: 2, storms: 2, errors: [] });
    expect(service.rpc).toHaveBeenCalledWith("expire_lost_cards");
    expect(service.rpc).toHaveBeenCalledWith("delay_expedition", { p_run: 1, p_leg: 0, p_hours: 2 });
    expect(service.rpc).toHaveBeenCalledWith("delay_expedition", { p_run: 2, p_leg: 0, p_hours: 2 });
    expect(postCardsWebhook).toHaveBeenCalledTimes(1);
    expect(postCardsWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Deep Raid — the squad is at a fork" }),
      "<@42> your Deep Raid has reached a fork.",
    );
    const update = service.calls.find((call) => call.verb === "update");
    expect(update).toMatchObject({ table: "expedition_runs", payload: { pinged: 1 }, filters: { id: 1 } });
  });
});

describe("claimExpeditionFor — match day and the echo", () => {
  /** The run's launch day is the 27th (Eastern); a fixture that evening is
   *  midnight UTC on the 28th, which is exactly the day-boundary trap the
   *  surge reads on the Eastern calendar to avoid. */
  const MATCH_NIGHT = [{ team_a: "Solari Sun", team_b: "Lunar Tide", scheduled_at: "2026-08-28T00:00:00.000Z" }];

  it("surges the payout by 20% when a squad card's team plays on the launch day, and records the team", async () => {
    const copies = [
      { ...copyRow({ id: 1 }), card: { slug: "doug-1", name: "Doug 1", teamName: "solari sun" } as unknown as PlayerCardData },
      copyRow({ id: 2 }),
      copyRow({ id: 3 }),
    ];
    const board = createBoard({ copies, run: runRow(), fixtures: MATCH_NIGHT });
    board.rpc.mockResolvedValue({ data: [{ balance: 500, fragments: 0, echo_id: null }], error: null });
    // The same scouting roll the test below makes pays 127 without a
    // fixture; x1.2 = 152.4, rounded. No merchant: a run with no forks
    // carries no encounters.
    scriptRand(0.5, 0.9, 0.9);

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ ok: true, surge: ["Solari Sun"], echo: null, outcome: { dollars: 152 } });
    expect(board.rpc).toHaveBeenCalledWith(
      "resolve_expedition",
      expect.objectContaining({ p_outcome: expect.objectContaining({ dollars: 152, surge: ["Solari Sun"] }) }),
    );
    // The calendar is read from a day before the launch, so an evening
    // fixture that is already the next day in UTC is inside the window.
    expect(board.calls.find((call) => call.table === "fixtures")?.filters["scheduled_at>="]).toBe("2026-08-26T18:00:00.000Z");
  });

  it("does not surge a squad whose teams are not on the card that night", async () => {
    const board = createBoard({ copies: scoutSquad, run: runRow(), fixtures: MATCH_NIGHT });
    board.rpc.mockResolvedValue({ data: [{ balance: 500, fragments: 0 }], error: null });
    scriptRand(0.5, 0.9, 0.9);

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ ok: true, surge: [], outcome: { dollars: 127 } });
  });

  it("lets a moment echo a copy of a card from its game, and names the minted copy", async () => {
    const moment = {
      ...copyRow({ id: 3, tier: "moment" }),
      card: {
        slug: "moment-7", name: "Doug 1",
        moment: { id: 7, weekStart: "2026-08-17", teamName: "Solari Sun", opponent: "Lunar Tide", playerSlug: "doug-1" },
      } as unknown as PlayerCardData,
    };
    const editions = [
      { card: { slug: "sun-top", name: "Sun Top", teamName: "Solari Sun" } as unknown as PlayerCardData },
      { card: { slug: "tide-mid", name: "Tide Mid", teamName: "Lunar Tide" } as unknown as PlayerCardData },
      { card: { slug: "owl-bot", name: "Owl Bot", teamName: "Night Owls" } as unknown as PlayerCardData },
    ];
    const board = createBoard({ copies: [copyRow({ id: 1 }), copyRow({ id: 2 }), moment], run: runRow(), editions });
    board.rpc.mockResolvedValue({ data: [{ balance: 500, fragments: 0, echo_id: 777 }], error: null });
    // Every draw reads 0.1: whatever the base roll consumes, the echo's
    // own roll is under 0.15 and the pick lands on the first of the two
    // cards that were in the game — the owl was never in it.
    scriptRand();
    randomBytes.mockReturnValue(randBuffer(0.1));

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ ok: true, echo: { inventoryId: 777, slug: "sun-top", playerName: "Sun Top", moment: 3 } });
    expect(board.rpc).toHaveBeenCalledWith(
      "resolve_expedition",
      expect.objectContaining({ p_outcome: expect.objectContaining({ echo: { slug: "sun-top", week: "2026-08-17", moment: 3 } }) }),
    );
    expect(board.calls.find((call) => call.table === "card_editions")?.filters).toMatchObject({ season: "s4", edition_week: "2026-08-17" });
    expect(postCardsWebhook).toHaveBeenCalledWith(expect.objectContaining({ title: "A moment echoed" }));
  });

  it("keeps the echo a story when the roll misses or the week was never archived", async () => {
    const moment = {
      ...copyRow({ id: 3, tier: "moment" }),
      card: { slug: "moment-7", name: "Doug 1", moment: { id: 7, weekStart: "2026-08-17", teamName: "Solari Sun" } } as unknown as PlayerCardData,
    };
    const board = createBoard({ copies: [copyRow({ id: 1 }), copyRow({ id: 2 }), moment], run: runRow(), editions: [] });
    board.rpc.mockResolvedValue({ data: [{ balance: 500, fragments: 0, echo_id: null }], error: null });
    scriptRand();
    randomBytes.mockReturnValue(randBuffer(0.1));

    expect(await claimExpeditionFor("42", 9)).toMatchObject({ ok: true, echo: null });
    const sent = (board.rpc.mock.calls[0] as unknown[])[1] as { p_outcome: Record<string, unknown> };
    expect(sent.p_outcome).not.toHaveProperty("echo");
  });
});

describe("the rulebook a run launched under", () => {
  it("meets nothing on the trail and takes no surge on a run stamped before the trail existed", async () => {
    // Run 9 as a raid carries a seeded merchant under the trail rules (see
    // "multiplies the base by what the forks earned"); stamped 1, the same
    // run pays its base and nothing more, and the calendar is never read.
    const copies = [
      { ...copyRow({ id: 1 }), card: { slug: "doug-1", name: "Doug 1", teamName: "Solari Sun" } as unknown as PlayerCardData },
      copyRow({ id: 2 }),
      copyRow({ id: 3 }),
    ];
    const board = createBoard({
      copies,
      run: runRow({ tier: "raid", shine: 12, forks: 2, rules: 1 }),
      fixtures: [{ team_a: "Solari Sun", team_b: "Lunar Tide", scheduled_at: "2026-08-28T00:00:00.000Z" }],
    });
    board.rpc.mockResolvedValue({ data: [{ balance: 700, fragments: 0 }], error: null });
    scriptRand(0.5, 0.9, 0.5);

    const result = await claimExpeditionFor("42", 9);

    expect(result).toMatchObject({ ok: true, merchant: 0, stranded: null, surge: [], echo: null, outcome: { dollars: 260 } });
    expect(board.calls.some((call) => call.table === "fixtures")).toBe(false);
  });

  it("never storms a run stamped before the trail existed", async () => {
    // Runs 1 and 2 carry seeded storms under the trail rules (see the
    // sweep test); stamped 1, the sweep leaves their clocks alone.
    const rows = [1, 2].map((id) =>
      runRow({ id, tier: "raid", forks: 2, startedAt: "2026-08-27T18:00:00.000Z", resolvesAt: "2026-08-28T18:00:00.000Z", rules: 1 }),
    );
    const service = createService((call) => (call.table === "expedition_runs" ? { data: rows } : { data: [] }));
    service.rpc.mockResolvedValue({ data: 0, error: null });
    createBettingServiceClient.mockReturnValue(service.client);

    const result = await sweepExpeditions(new Date("2026-08-28T12:00:00.000Z"));

    expect(result.storms).toBe(0);
    expect(service.rpc).not.toHaveBeenCalledWith("delay_expedition", expect.anything());
  });
});
