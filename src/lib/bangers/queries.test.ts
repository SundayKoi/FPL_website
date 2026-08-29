import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, serverRpc } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  serverRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/betting/service-client", () => ({
  createBettingServiceClient: () => {
    throw new Error("service credentials are unavailable");
  },
}));

import { fetchBangerPosts, fetchBangerViewerVotes, fetchDailyBanger } from "./queries";

const databasePost = {
  id: "post-1",
  body: "A real post",
  published_at: "2026-08-22T12:00:00.000Z",
  x_url: "https://x.com/Stuart69Davis/status/post-1",
};

function createPublicClient() {
  const postsQuery = {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [databasePost], error: null }),
      })),
    })),
  };
  return {
    from: vi.fn(() => postsQuery),
    rpc: serverRpc,
  };
}

describe("public Banger Board queries", () => {
  beforeEach(() => {
    serverRpc.mockReset();
    createServerSupabase.mockReset();
    createServerSupabase.mockResolvedValue(createPublicClient());
  });

  it("loads posts and their vote counts without service credentials", async () => {
    serverRpc.mockResolvedValue({
      data: [{ post_id: "post-1", banger_votes: 2, mid_votes: 1, stinker_votes: 0 }],
      error: null,
    });

    await expect(fetchBangerPosts()).resolves.toEqual([
      {
        id: "post-1",
        text: "A real post",
        publishedAt: "2026-08-22T12:00:00.000Z",
        url: "https://x.com/Stuart69Davis/status/post-1",
        bangerVotes: 2,
        midVotes: 1,
        stinkerVotes: 0,
      },
    ]);
  });

  it("loads the daily post without service credentials", async () => {
    serverRpc.mockResolvedValue({
      data: [{
        check_date: "2026-08-24",
        post_id: "post-1",
        body: "A real post",
        published_at: "2026-08-22T12:00:00.000Z",
        x_url: "https://x.com/Stuart69Davis/status/post-1",
        starts_at: "2026-08-24T00:00:00.000Z",
        ends_at: "2026-08-25T00:00:00.000Z",
        banger_votes: 2,
        mid_votes: 1,
        stinker_votes: 0,
      }],
      error: null,
    });

    await expect(fetchDailyBanger()).resolves.toMatchObject({
      id: "post-1",
      text: "A real post",
      checkDate: "2026-08-24",
    });
  });

  it("falls back to the saved vote when reward_amount is not deployed yet", async () => {
    const selections: string[] = [];
    const from = vi.fn((table: string) => ({
      select(columns: string) {
        selections.push(`${table}:${columns}`);
        const filters: Record<string, unknown> = {};
        const result = () => {
          if (table === "banger_votes") return { data: [], error: null };
          if (columns === "vote, reward_amount") {
            return { data: null, error: { message: "column daily_banger_votes.reward_amount does not exist" } };
          }
          return { data: { vote: "mid" }, error: null };
        };
        const builder = {
          eq(column: string, value: unknown) {
            filters[column] = value;
            return builder;
          },
          maybeSingle: async () => result(),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return builder;
      },
    }));
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "profile-1" } } }) },
      from,
    });

    await expect(fetchBangerViewerVotes("2026-08-24")).resolves.toEqual({
      postVotes: {},
      dailyVote: "mid",
      dailyRewardAmount: undefined,
    });
    expect(selections).toContain("daily_banger_votes:vote");
  });
});
