import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
const { rpc, upsert } = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }));
const { sessionUpsert } = vi.hoisted(() => ({ sessionUpsert: vi.fn() }));

vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ from: vi.fn(() => ({ upsert: sessionUpsert })) })),
}));
vi.mock("@/lib/betting/service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc, from: vi.fn(() => ({ upsert })) })),
}));

import { voteBangerPost, voteDailyBanger } from "./actions";

beforeEach(() => {
  getBettingUser.mockResolvedValue({ profileId: "user-1", allowed: true });
  sessionUpsert.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ error: { message: "stale RPC" } });
  upsert.mockReset().mockResolvedValue({ error: null });
});

describe("voteBangerPost", () => {
  it("writes through the signed-in Supabase session", async () => {
    await expect(voteBangerPost("post-1", "banger")).resolves.toEqual({ ok: true });
    expect(sessionUpsert).toHaveBeenCalledWith(
      { post_id: "post-1", voter_id: "user-1", vote: "banger" },
      { onConflict: "post_id,voter_id" },
    );
  });

  it("falls back to the service-role RPC when the session write fails", async () => {
    sessionUpsert.mockResolvedValue({ error: { message: "session failure" } });

    await expect(voteBangerPost("post-1", "mid")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("vote_banger_post", { p_post_id: "post-1", p_voter_id: "user-1", p_vote: "mid" });
  });

  it("reports a save error when all write paths fail", async () => {
    sessionUpsert.mockResolvedValue({ error: { message: "session failure" } });
    rpc.mockResolvedValue({ error: { message: "rpc failure" } });
    upsert.mockResolvedValue({ error: { message: "constraint failure" } });

    await expect(voteBangerPost("post-1", "mid")).resolves.toEqual({ ok: false, error: "That vote could not be saved." });
  });
});

describe("voteDailyBanger", () => {
  it("returns the actual reward amount from the payout RPC", async () => {
    rpc.mockResolvedValue({ data: [{ balance: 1300, reward_amount: 300, already_voted: false }], error: null });

    await expect(voteDailyBanger("post-1", "banger")).resolves.toEqual({
      ok: true,
      balance: 1300,
      rewardAmount: 300,
      alreadyVoted: false,
    });
  });
});
