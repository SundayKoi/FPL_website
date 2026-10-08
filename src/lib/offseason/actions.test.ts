import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, revalidatePath } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { createMatchesAction, lockInAction, setGameAction, setLockInAction, signUpAction, updateEventAction } from "./actions";

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
});

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

  it("numbers new matches after the week's last one", async () => {
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
});
