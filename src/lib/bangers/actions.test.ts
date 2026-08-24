import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
const { rpc, upsert } = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }));

vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));
vi.mock("@/lib/betting/service-client", () => ({
  createBettingServiceClient: vi.fn(() => ({ rpc, from: vi.fn(() => ({ upsert })) })),
}));

import { voteBangerPost } from "./actions";

beforeEach(() => {
  getBettingUser.mockResolvedValue({ profileId: "user-1", allowed: true });
  rpc.mockReset().mockResolvedValue({ error: { message: "stale RPC" } });
  upsert.mockReset().mockResolvedValue({ error: null });
});

describe("voteBangerPost", () => {
  it("falls back to the service-role vote upsert when the RPC fails", async () => {
    await expect(voteBangerPost("post-1", "banger")).resolves.toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      { post_id: "post-1", voter_id: "user-1", vote: "banger" },
      { onConflict: "post_id,voter_id" },
    );
  });

  it("reports a save error when both write paths fail", async () => {
    upsert.mockResolvedValue({ error: { message: "constraint failure" } });

    await expect(voteBangerPost("post-1", "mid")).resolves.toEqual({ ok: false, error: "That vote could not be saved." });
  });
});
