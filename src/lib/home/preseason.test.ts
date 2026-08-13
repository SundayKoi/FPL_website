import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPreseasonHomeData } from "./preseason";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

afterEach(() => createServerSupabase.mockReset());

describe("fetchPreseasonHomeData", () => {
  it("returns featured-draft teams, points left, and player lock state", async () => {
    const from = vi.fn((table: string) => {
      if (table === "league_settings") return query({ data: { featured_draft_id: "draft-s5" }, error: null });
      if (table === "drafts") return query({ data: { id: "draft-s5", name: "Season 5 Draft" }, error: null });
      if (table === "teams") {
        return query({
          data: [
            {
              id: "team-a",
              name: "Alpha",
              abbreviation: "ALP",
              division: "Lunari",
              image_url: null,
              banner_color: "#123456",
              captain_profile_id: "profile-a",
              nomination_position: 1,
              budget_start: 100,
              points_remaining: 74,
            },
          ],
          error: null,
        });
      }
      if (table === "profiles") return query({ data: [{ id: "profile-a", display_name: "Captain Alpha" }], error: null });
      if (table === "player_pool") {
        return query({
          data: [{ id: "canonical-open", display_name: "Open Player", rank: "M10", opgg_url: "https://op.gg/canonical-open" }],
          error: null,
        });
      }
      return query({
        data: [
          { id: "player-1", display_name: "Open Player", role: "top", rank: null, opgg_url: null, team_id: null, price: null, acquisition: null, canonical_player_id: "canonical-open" },
          { id: "player-2", display_name: "Captain Player", role: "jungle", rank: "D3", opgg_url: "https://op.gg/captain", team_id: "team-a", price: 0, acquisition: "captain" },
          { id: "player-3", display_name: "Free Agent Player", role: "mid", rank: "D4", opgg_url: "https://op.gg/free-agent", team_id: "team-a", price: 10, acquisition: "free_agency" },
        ],
        error: null,
      });
    });
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchPreseasonHomeData()).resolves.toMatchObject({
      draftId: "draft-s5",
      draftName: "Season 5 Draft",
      teams: [{
        name: "Alpha",
        captainName: "Captain Alpha",
        pointsRemaining: 74,
        rosterCount: 2,
        draftedPlayers: [
          expect.objectContaining({ displayName: "Captain Player", acquisition: "captain" }),
          expect.objectContaining({ displayName: "Free Agent Player", acquisition: "free_agency" }),
        ],
      }],
      players: [
        expect.objectContaining({ displayName: "Open Player", available: true, rank: "M10", opggUrl: "https://op.gg/canonical-open" }),
        expect.objectContaining({ displayName: "Captain Player", available: false, lockLabel: "Captain" }),
        expect.objectContaining({ displayName: "Free Agent Player", available: false, lockLabel: "Free agency" }),
      ],
    });
  });

  it("returns an empty preview when no draft is featured", async () => {
    createServerSupabase.mockResolvedValue({
      from: vi.fn(() => query({ data: { featured_draft_id: null }, error: null })),
    });

    await expect(fetchPreseasonHomeData()).resolves.toEqual({
      draftId: null,
      draftName: null,
      teams: [],
      players: [],
    });
  });
});
