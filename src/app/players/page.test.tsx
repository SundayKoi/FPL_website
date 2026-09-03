import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayersPage from "./page";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function orderableQuery(result: unknown) {
  const builder = {
    select: () => builder,
    eq: vi.fn(() => builder),
    order: () => builder,
    single: () => Promise.resolve(result),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return builder;
}

describe("PlayersPage", () => {
  afterEach(cleanup);
  afterEach(() => {
    createServerSupabase.mockReset();
  });

  it("renders canonical player-pool rows with exact op.gg links", async () => {
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        const query = orderableQuery({
          data: [
            {
              season_key: "season-5",
              display_name: "RiftMaker#NA1",
              role: "top",
              rank: "D1",
              opgg_url: "https://op.gg/lol/summoners/na/RiftMaker-NA1?exact=1",
            },
            {
              season_key: "season-5",
              display_name: "WaveClear#NA1",
              role: "support",
              rank: "E2",
              opgg_url: "https://op.gg/lol/summoners/na/WaveClear-NA1",
            },
          ],
          error: null,
        });
        query.eq = vi.fn(() => query);
        return query;
      }

      if (table === "free_agency_avg_bids") {
        return { select: async () => ({ data: [], error: null }) };
      }

      if (table === "league_settings") {
        return orderableQuery({ data: { current_season: "S5", academy_season: "A1" }, error: null });
      }

      return { select: async () => ({ data: null, error: null }) };
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });

    render(await PlayersPage());

    expect(from).toHaveBeenCalledWith("player_pool");
    const playerPoolQuery = from.mock.results.find((result) => result.value?.eq)?.value;
    expect(playerPoolQuery.eq).toHaveBeenCalledWith("season_key", "season-5");

    expect(screen.getByRole("heading", { name: "Players", level: 1 })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Season 5" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "RiftMaker#NA1" }).getAttribute("href")).toBe("/players/RiftMaker%23NA1");
    expect(screen.getByRole("link", { name: "RiftMaker#NA1 on op.gg" }).getAttribute("href")).toBe(
      "https://op.gg/lol/summoners/na/RiftMaker-NA1?exact=1",
    );
    expect(screen.queryByRole("link", { name: "Captain: Winter" })).toBeNull();
    expect(from).not.toHaveBeenCalledWith("player_identity_links");
  });

  it("shows a clear unavailable state when canonical Season 5 rows are missing", async () => {
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        const query = orderableQuery({ data: [], error: null });
        query.eq = vi.fn(() => query);
        return query;
      }

      if (table === "free_agency_avg_bids") {
        return { select: async () => ({ data: [], error: null }) };
      }

      if (table === "league_settings") {
        return orderableQuery({ data: { current_season: "S5", academy_season: "A1" }, error: null });
      }

      return { select: async () => ({ data: null, error: null }) };
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });

    render(await PlayersPage());

    expect(screen.getByText("Player List data is unavailable for Season 5 right now.")).toBeTruthy();
    expect(from).not.toHaveBeenCalledWith("player_identity_links");
  });

  it("loads active-season identity links and verified profiles only for player-pool admins", async () => {
    const identityQuery = orderableQuery({
      data: [
        {
          id: "link-1",
          player_pool_id: "player-1",
          profile_id: "profile-2",
          status: "approved",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        return orderableQuery({
          data: [
            {
              id: "player-1",
              season_key: "season-5",
              display_name: "RiftMaker#NA1",
              role: "top",
              rank: "D1",
              opgg_url: "https://op.gg/riftmaker",
            },
          ],
          error: null,
        });
      }
      if (table === "free_agency_avg_bids") {
        return { select: async () => ({ data: [], error: null }) };
      }
      if (table === "league_settings") {
        return orderableQuery({
          data: { current_season: "S5", academy_season: "A1" },
          error: null,
        });
      }
      if (table === "player_identity_links") return identityQuery;
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            if (columns.includes("is_admin")) {
              return orderableQuery({
                data: { is_admin: true, is_owner: false, is_broadcaster: false },
                error: null,
              });
            }
            return orderableQuery({
              data: [{ id: "profile-2", display_name: "Verified Bravo", discord_id: "222222" }],
              error: null,
            });
          },
        };
      }
      return orderableQuery({ data: null, error: null });
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
      from,
    });

    render(await PlayersPage());
    fireEvent.click(screen.getByRole("button", { name: "Edit Player Pool" }));

    expect(from).toHaveBeenCalledWith("player_identity_links");
    expect(identityQuery.eq).toHaveBeenCalledWith("league", "premier");
    expect(identityQuery.eq).toHaveBeenCalledWith("season", "S5");
    expect(screen.getByText("Linked — Verified Bravo")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Verified Bravo.*222222/ })).toBeTruthy();
  });
});
