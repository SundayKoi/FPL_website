import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireBettingStaff } = vi.hoisted(() => ({ requireBettingStaff: vi.fn() }));
vi.mock("./access", () => ({ requireBettingStaff }));

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("./service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc, from })),
}));

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  createMarket,
  resolveMarket,
  cancelMarket,
  deleteMarket,
  createPickem,
  resolvePickem,
  cancelPickem,
  upsertTeam,
  deleteTeam,
  upsertEvent,
  deleteEvent,
  upsertStoreItem,
  deleteStoreItem,
  createSeason,
  closeSeason,
  grantPoints,
} from "./admin-actions";

const STAFF_CTX = { discordId: "staff-1", profileId: "profile-1" };

/** A Supabase-query-builder-shaped mock: every chain method returns the same
 * object, and the object itself resolves (via `.then`) to `result` — so
 * `await from(...).select(...).eq(...).single()` and
 * `await from(...).delete().eq(...)` both work regardless of how many links
 * are in the chain. */
function chainable(result: { data: unknown; error: unknown }) {
  const obj: Record<string, unknown> = {
    select: vi.fn(() => obj),
    eq: vi.fn(() => obj),
    in: vi.fn(() => obj),
    order: vi.fn(() => obj),
    limit: vi.fn(() => obj),
    insert: vi.fn(() => obj),
    update: vi.fn(() => obj),
    delete: vi.fn(() => obj),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return obj;
}

beforeEach(() => {
  requireBettingStaff.mockReset().mockResolvedValue(STAFF_CTX);
  rpc.mockReset().mockResolvedValue({ data: 1, error: null });
  from.mockReset().mockReturnValue(chainable({ data: null, error: null }));
  revalidatePath.mockReset();
});

// === Authorization: every admin action rejects a non-staff caller before ===
// touching the RPC layer or any table read/write.
describe("authorization (non-staff rejected before any RPC/table call)", () => {
  const cases: [string, () => Promise<{ ok: boolean }>][] = [
    [
      "createMarket",
      () =>
        createMarket({
          eventId: 1,
          teamAId: 1,
          teamBId: 2,
          title: "Final",
          gameAt: "2026-09-01T00:00:00Z",
          drawEnabled: false,
        }),
    ],
    ["resolveMarket", () => resolveMarket(1, 2)],
    ["cancelMarket", () => cancelMarket(1)],
    ["deleteMarket", () => deleteMarket(1)],
    ["createPickem", () => createPickem({ eventId: 1, title: "Night 1", marketIds: [1, 2] })],
    ["resolvePickem", () => resolvePickem(1)],
    ["cancelPickem", () => cancelPickem(1)],
    ["upsertTeam", () => upsertTeam({ name: "Team A", shortCode: "TA" })],
    ["deleteTeam", () => deleteTeam(1)],
    ["upsertEvent", () => upsertEvent({ name: "Playoffs" })],
    ["deleteEvent", () => deleteEvent(1)],
    ["upsertStoreItem", () => upsertStoreItem({ name: "Role", cost: 500, type: "role", active: true })],
    ["deleteStoreItem", () => deleteStoreItem(1)],
    ["createSeason", () => createSeason("Season 1")],
    ["closeSeason", () => closeSeason(1, 0)],
    ["grantPoints", () => grantPoints("42", 100, "correcting a bug")],
  ];

  it.each(cases)("%s rejects a non-staff caller without an RPC or table call", async (_name, run) => {
    requireBettingStaff.mockRejectedValue(new Error("betting: staff only"));

    const result = await run();

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});

describe("resolveMarket", () => {
  beforeEach(() => {
    from.mockImplementation((table: string) => {
      if (table === "betting_markets") {
        return chainable({ data: { team_a_id: 1, team_b_id: 2, draw_enabled: false, status: "LOCKED" }, error: null });
      }
      return chainable({ data: null, error: null });
    });
  });

  it("rejects a winner that isn't one of the market's teams, without calling the RPC", async () => {
    const result = await resolveMarket(5, 99);

    expect(result).toEqual({ ok: false, error: "Winner must be one of the market's two teams (or -1 for a draw)." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects the draw sentinel (-1) when the market has no draw option", async () => {
    const result = await resolveMarket(5, -1);

    expect(result).toEqual({ ok: false, error: "Winner must be one of the market's two teams (or -1 for a draw)." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts team A as the winner and calls resolve_market_admin", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await resolveMarket(5, 1);

    expect(rpc).toHaveBeenCalledWith("resolve_market_admin", { p_actor: "staff-1", p_market: 5, p_winner: 1 });
    expect(result).toEqual({ ok: true });
  });

  it("accepts -1 when the market has a draw option enabled", async () => {
    from.mockImplementation((table: string) => {
      if (table === "betting_markets") {
        return chainable({ data: { team_a_id: 1, team_b_id: 2, draw_enabled: true, status: "LOCKED" }, error: null });
      }
      return chainable({ data: null, error: null });
    });
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await resolveMarket(5, -1);

    expect(rpc).toHaveBeenCalledWith("resolve_market_admin", { p_actor: "staff-1", p_market: 5, p_winner: -1 });
    expect(result).toEqual({ ok: true });
  });

  it("returns a friendly error when the market doesn't exist", async () => {
    from.mockImplementation(() => chainable({ data: null, error: null }));

    const result = await resolveMarket(999, 1);

    expect(result).toEqual({ ok: false, error: "Market not found." });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("createMarket", () => {
  it("rejects team A and team B being the same team, without calling the RPC", async () => {
    const result = await createMarket({
      eventId: 1,
      teamAId: 3,
      teamBId: 3,
      title: "Bad market",
      gameAt: "2026-09-01T00:00:00Z",
      drawEnabled: false,
    });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a blank title without calling the RPC", async () => {
    const result = await createMarket({
      eventId: 1,
      teamAId: 1,
      teamBId: 2,
      title: "   ",
      gameAt: "2026-09-01T00:00:00Z",
      drawEnabled: false,
    });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls create_market_admin with the actor and normalized args", async () => {
    rpc.mockResolvedValue({ data: 42, error: null });

    const result = await createMarket({
      eventId: 1,
      teamAId: 1,
      teamBId: 2,
      title: "Grand Final",
      gameAt: "2026-09-01T00:00:00Z",
      rakeBps: 500,
      drawEnabled: true,
    });

    expect(rpc).toHaveBeenCalledWith("create_market_admin", {
      p_actor: "staff-1",
      p_event: 1,
      p_team_a: 1,
      p_team_b: 2,
      p_title: "Grand Final",
      p_rules: null,
      p_game_at: "2026-09-01T00:00:00Z",
      p_rake_bps: 500,
      p_open_line_prob_a: null,
      p_draw_enabled: true,
    });
    expect(result).toEqual({ ok: true, id: 42 });
  });

  it("rejects a game time in the past, without calling the RPC", async () => {
    const result = await createMarket({
      eventId: 1,
      teamAId: 1,
      teamBId: 2,
      title: "Grand Final",
      gameAt: "2020-01-01T00:00:00Z",
      drawEnabled: false,
    });

    expect(result).toEqual({ ok: false, error: "game time must be in the future" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("upsertTeam", () => {
  it("inserts a new team and writes an audit row when no id is given", async () => {
    from.mockImplementation((table: string) => {
      if (table === "betting_teams") return chainable({ data: { id: 7 }, error: null });
      return chainable({ data: null, error: null });
    });

    const result = await upsertTeam({ name: "Blue Team", shortCode: "BLU", color: "#1122ff" });

    expect(from).toHaveBeenCalledWith("betting_teams");
    expect(rpc).toHaveBeenCalledWith(
      "_audit",
      expect.objectContaining({ p_actor: "staff-1", p_action: "team_upsert" }),
    );
    expect(result).toEqual({ ok: true, id: 7 });
  });

  it("rejects a blank name without touching the table", async () => {
    const result = await upsertTeam({ name: "  ", shortCode: "BLU" });

    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("upsertStoreItem", () => {
  it("calls upsert_store_item_admin", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    const result = await upsertStoreItem({ name: "VIP Role", cost: 5000, type: "role", active: true });

    expect(rpc).toHaveBeenCalledWith("upsert_store_item_admin", {
      p_actor: "staff-1",
      p_id: null,
      p_name: "VIP Role",
      p_description: null,
      p_cost: 5000,
      p_type: "role",
      p_payload: null,
      p_active: true,
    });
    expect(result).toEqual({ ok: true, id: 3 });
  });

  it("rejects a non-positive cost without calling the RPC", async () => {
    const result = await upsertStoreItem({ name: "Bad", cost: 0, type: "role", active: true });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("createSeason", () => {
  it("calls create_season_admin", async () => {
    rpc.mockResolvedValue({ data: 9, error: null });

    const result = await createSeason("Season 2");

    expect(rpc).toHaveBeenCalledWith("create_season_admin", { p_actor: "staff-1", p_name: "Season 2" });
    expect(result).toEqual({ ok: true, id: 9 });
  });

  it("rejects a blank name without calling the RPC", async () => {
    const result = await createSeason("   ");

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("closeSeason", () => {
  it("calls close_season_admin", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await closeSeason(9, 1000);

    expect(rpc).toHaveBeenCalledWith("close_season_admin", { p_actor: "staff-1", p_season: 9, p_reset_to: 1000 });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a negative resetTo without calling the RPC", async () => {
    const result = await closeSeason(9, -1);

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// === grantPoints: admin_grant (20260813000007_betting_admin_grant.sql) =====
describe("grantPoints", () => {
  it("rejects a non-staff caller before touching the RPC (covered again here for clarity)", async () => {
    requireBettingStaff.mockRejectedValue(new Error("betting: staff only"));

    const result = await grantPoints("42", 500, "tournament prize");

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls admin_grant with the actor and p_note=reason", async () => {
    rpc.mockResolvedValue({ data: 900, error: null });

    const result = await grantPoints("42", 500, "tournament prize");

    expect(rpc).toHaveBeenCalledWith("admin_grant", {
      p_actor: "staff-1",
      p_target: "42",
      p_amount: 500,
      p_note: "tournament prize",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a zero delta without calling the RPC", async () => {
    const result = await grantPoints("42", 0, "oops");

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a blank discord id or reason without calling the RPC", async () => {
    expect((await grantPoints("", 100, "reason")).ok).toBe(false);
    expect((await grantPoints("42", 100, "")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's own guard errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "grant would make balance negative" } });

    const result = await grantPoints("42", -5000, "oops");

    expect(result).toEqual({ ok: false, error: "grant would make balance negative" });
  });
});

describe("createPickem", () => {
  it("rejects fewer than 2 legs without calling the RPC", async () => {
    const result = await createPickem({ eventId: 1, title: "Night", marketIds: [1] });

    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls create_pickem_admin", async () => {
    rpc.mockResolvedValue({ data: 11, error: null });

    const result = await createPickem({ eventId: 1, title: "Night 1", marketIds: [1, 2, 3] });

    expect(rpc).toHaveBeenCalledWith("create_pickem_admin", {
      p_actor: "staff-1",
      p_event: 1,
      p_title: "Night 1",
      p_markets: [1, 2, 3],
    });
    expect(result).toEqual({ ok: true, id: 11 });
  });
});

describe("resolvePickem / cancelPickem", () => {
  it("resolvePickem calls resolve_pickem with just the pickem id", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await resolvePickem(4);

    expect(rpc).toHaveBeenCalledWith("resolve_pickem", { p_pickem: 4 });
    expect(result).toEqual({ ok: true });
  });

  it("cancelPickem calls cancel_pickem_admin with the actor", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const result = await cancelPickem(4);

    expect(rpc).toHaveBeenCalledWith("cancel_pickem_admin", { p_actor: "staff-1", p_pickem: 4 });
    expect(result).toEqual({ ok: true });
  });
});

describe("RPC error surfacing", () => {
  it("returns the RPC's error message rather than throwing", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "market 5 already resolved" } });

    const result = await cancelMarket(5);

    expect(result).toEqual({ ok: false, error: "market 5 already resolved" });
  });
});
