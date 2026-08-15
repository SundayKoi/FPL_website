import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftState } from "./useDraftState";

const profileState = vi.hoisted(() => ({
  id: "profile-secondary" as string | null,
}));

const draftRow = {
  id: "draft-1",
  name: "Test Draft",
  status: "setup" as const,
  countdown_seconds: 30,
  round_minimums: [],
  current_round: 1,
  current_nominator_team_id: null,
  paused_time_remaining: null,
  created_at: "2026-08-15T00:00:00Z",
  starts_at: null,
};

const teamRows = [
  {
    id: "team-1",
    draft_id: "draft-1",
    name: "Team One",
    captain_profile_id: "profile-primary",
    captain_profile_id_2: "profile-secondary",
    abbreviation: "ONE",
    image_url: null,
    banner_color: null,
    division: null,
    nomination_position: 1,
    budget_start: 200,
    points_remaining: 200,
  },
];

const supabaseMocks = vi.hoisted(() => {
  const getUser = vi.fn(async () => ({ data: { user: profileState.id ? { id: profileState.id } : null } }));
  const removeChannel = vi.fn(async () => {});
  const subscribe = vi.fn((callback: (status: string) => void) => {
    callback("SUBSCRIBED");
    return channelApi;
  });
  const on = vi.fn(() => channelApi);
  const channelApi = { on, subscribe };
  const channel = vi.fn(() => channelApi);

  const from = vi.fn((table: string) => {
    const builder = {
      select: vi.fn((columns?: string) => {
        if (table === "drafts") {
          return {
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: draftRow })),
            })),
          };
        }
        if (table === "teams") {
          return {
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: teamRows })),
            })),
          };
        }
        if (table === "players") {
          return {
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [] })),
            })),
          };
        }
        if (table === "lots") {
          return {
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: [] })),
            })),
          };
        }
        if (table === "player_pool") {
          return {
            eq: vi.fn(async () => ({ data: [] })),
          };
        }
        if (table === "profiles" && columns === "is_admin") {
          return {
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { is_admin: false } })),
            })),
          };
        }
        if (table === "bids") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                order: vi.fn(async () => ({ data: [] })),
              })),
            })),
          };
        }
        throw new Error(`Unhandled table query: ${table}`);
      }),
    };

    return builder;
  });

  return { getUser, removeChannel, subscribe, on, channel, from };
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: supabaseMocks.getUser },
    from: supabaseMocks.from,
    channel: supabaseMocks.channel,
    removeChannel: supabaseMocks.removeChannel,
    rpc: vi.fn(),
  }),
}));

vi.mock("@/lib/time", () => ({
  fetchServerOffset: vi.fn(async () => 0),
  remainingMs: vi.fn(() => 1_000),
}));

describe("useDraftState", () => {
  beforeEach(() => {
    profileState.id = "profile-secondary";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves myTeam for a secondary captain", async () => {
    const { result } = renderHook(() => useDraftState("draft-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.myTeam?.id).toBe("team-1");
  });

  it("returns null for an unrelated profile", async () => {
    profileState.id = "profile-unrelated";

    const { result } = renderHook(() => useDraftState("draft-1"));

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.myTeam).toBeNull();
  });
});
