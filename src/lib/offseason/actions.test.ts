import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, revalidatePath } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  createMatchesAction,
  createWeekDraftAction,
  importWeekDraftAction,
  lockInAction,
  setGameAction,
  setLockInAction,
  signUpAction,
  updateEventAction,
} from "./actions";

type Result = { data?: unknown; error: { message: string; code?: string } | null };

function client({ rpc = { error: null } as Result, write = { error: null } as Result, lastSortOrder = null as number | null } = {}) {
  const rpcFn = vi.fn(async () => rpc);
  const insert = vi.fn(async () => write);
  const eq = vi.fn(async () => write);
  const update = vi.fn(() => ({ eq }));
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: lastSortOrder === null ? null : { sort_order: lastSortOrder }, error: null })),
    insert,
    update,
  };
  const from = vi.fn(() => query);
  createServerSupabase.mockResolvedValue({ rpc: rpcFn, from });
  return { rpcFn, from, insert, update, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** A client whose reads answer per table, recording what gets inserted. */
function tableClient(tables: Record<string, unknown>, rpc: Result = { error: null }) {
  const inserted: { table: string; rows: unknown }[] = [];
  const from = vi.fn((table: string) => {
    const result = { data: tables[table] ?? null, error: null };
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      insert: vi.fn(async (rows: unknown) => {
        inserted.push({ table, rows });
        return { error: null };
      }),
    };
    for (const method of ["select", "eq", "order", "limit"]) query[method] = vi.fn(() => query);
    query.single = vi.fn(async () => result);
    query.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    return query;
  });
  createServerSupabase.mockResolvedValue({ rpc: vi.fn(async () => rpc), from });
  return { inserted };
}

describe("offseason server actions", () => {
  it("signs up through the RPC and refreshes the offseason pages", async () => {
    const { rpcFn } = client();
    const result = await signUpAction({
      eventId: "event-1",
      displayName: "Faker",
      riotId: "Hide on bush#KR1",
      opggUrl: "",
      currentRank: "Challenger",
      primaryRole: "mid",
      secondaryRole: null,
    });
    expect(result).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_sign_up", {
      p_event_id: "event-1",
      p_display_name: "Faker",
      p_riot_id: "Hide on bush#KR1",
      p_opgg_url: "",
      p_current_rank: "Challenger",
      p_primary_role: "mid",
      p_secondary_role: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");
  });

  it("turns a coded RPC error into its message", async () => {
    client({ rpc: { error: { message: "RIOT_ID_TAKEN: that Riot ID is already signed up" } } });
    const result = await setGameAction("match-1", 1, "NA1_123", null);
    expect(result).toEqual({ ok: false, error: "that Riot ID is already signed up" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("explains a row-level security refusal", async () => {
    client({ write: { error: { message: 'new row violates row-level security policy for table "offseason_events"', code: "42501" } } });
    const result = await updateEventAction("event-1", { signups_open: false });
    expect(result).toEqual({ ok: false, error: "Only offseason staff can do that." });
  });

  it("locks in through the RPC, claiming by Riot ID only when one is given", async () => {
    const { rpcFn } = client();
    expect(await lockInAction({ eventId: "event-1", role: "top" })).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenLastCalledWith("offseason_lock_in", { p_event_id: "event-1", p_role: "top", p_riot_id: null });
    await lockInAction({ eventId: "event-1", role: "top", riotId: " Pat Doe#NA1 " });
    expect(rpcFn).toHaveBeenLastCalledWith("offseason_lock_in", { p_event_id: "event-1", p_role: "top", p_riot_id: "Pat Doe#NA1" });
    expect(revalidatePath).toHaveBeenCalledWith("/offseason", "layout");
  });

  it("lets staff record or clear a lock-in", async () => {
    const { update, eq } = client();
    await setLockInAction("entrant-1", "mid");
    expect(update).toHaveBeenLastCalledWith({ locked_in_role: "mid", locked_in_at: expect.any(String) });
    expect(eq).toHaveBeenLastCalledWith("id", "entrant-1");
    await setLockInAction("entrant-1", null);
    expect(update).toHaveBeenLastCalledWith({ locked_in_role: null, locked_in_at: null });
  });

  it("creates a week's draft with no round minimums", async () => {
    const { rpcFn } = client();
    expect(await createWeekDraftAction("week-1", "main", { budget: 100, countdownSeconds: 15 })).toEqual({ ok: true });
    expect(rpcFn).toHaveBeenCalledWith("offseason_create_week_draft", {
      p_week_id: "week-1",
      p_tier: "main",
      p_budget: 100,
      p_countdown_seconds: 15,
      p_round_minimums: [1],
    });
  });

  it("numbers new matches after the week's last one", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const { insert } = client({ lastSortOrder: 4 });
    const result = await createMatchesAction("week-1", "round_robin", 1, [
      { teamA: "a", teamB: "b" },
      { teamA: "c", teamB: "d" },
    ]);
    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith([
      { week_id: "week-1", stage: "round_robin", best_of: 1, team_a_id: "a", team_b_id: "b", sort_order: 5 },
      { week_id: "week-1", stage: "round_robin", best_of: 1, team_a_id: "c", team_b_id: "d", sort_order: 6 },
    ]);
  });

  it("puts each new match on random sides", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const { insert } = client();
    await createMatchesAction("week-1", "final", 5, [{ teamA: "a", teamB: "b" }]);
    expect(insert).toHaveBeenCalledWith([{ week_id: "week-1", stage: "final", best_of: 5, team_a_id: "b", team_b_id: "a", sort_order: 1 }]);
  });

  it("schedules a tier as soon as its teams are imported", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const { inserted } = tableClient({
      offseason_weeks: { week_number: 3, elimination_draft_id: "draft-e" },
      offseason_teams: [
        { id: "m1", tier: "main" },
        { id: "e1", tier: "elimination" },
        { id: "e2", tier: "elimination" },
        { id: "e3", tier: "elimination" },
        { id: "e4", tier: "elimination" },
      ],
      offseason_matches: [],
    });
    expect(await importWeekDraftAction("week-1", "elimination")).toEqual({ ok: true });
    expect(inserted).toEqual([
      {
        table: "offseason_matches",
        rows: [
          { week_id: "week-1", stage: "elimination", best_of: 5, team_a_id: "e1", team_b_id: "e2", sort_order: 1 },
          { week_id: "week-1", stage: "elimination", best_of: 5, team_a_id: "e3", team_b_id: "e4", sort_order: 2 },
        ],
      },
    ]);
  });

  it("does not schedule a tier twice, and reports a failed import", async () => {
    const { inserted } = tableClient({
      offseason_weeks: { week_number: 1, elimination_draft_id: null },
      offseason_teams: [
        { id: "m1", tier: "main" },
        { id: "m2", tier: "main" },
      ],
      offseason_matches: [{ stage: "round_robin" }],
    });
    expect(await importWeekDraftAction("week-1", "main")).toEqual({ ok: true });
    expect(inserted).toEqual([]);

    tableClient({}, { error: { message: "DRAFT_NOT_FINISHED: every team needs all five roles first" } });
    expect(await importWeekDraftAction("week-1", "main")).toEqual({ ok: false, error: "every team needs all five roles first" });
  });
});
