import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AcademyPlayersPage from "./page";

const { createServerSupabase, fetchAcademyDraftData, fetchAcademyPlayers, directoryProps } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchAcademyDraftData: vi.fn(),
  fetchAcademyPlayers: vi.fn(),
  directoryProps: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/academy/playerSheet", async () => {
  const actual = await vi.importActual<typeof import("@/lib/academy/playerSheet")>("@/lib/academy/playerSheet");
  return {
    ...actual,
    fetchAcademyPlayers,
  };
});
vi.mock("@/components/academy/AcademyPlayersDirectory", () => ({
  default: (props: {
    canonicalPlayers?: Array<{ display_name: string }>;
    isAdmin?: boolean;
    poolSeasonKey?: string;
    identitySeason?: string;
    identityLinks?: Array<{ id: string; profileId: string; status: string }>;
    identityProfiles?: Array<{ id: string; displayName: string; discordId: string | null }>;
  }) => {
    directoryProps(props);
    return (
      <div>
        <p>{props.poolSeasonKey}</p>
        <p>{props.canonicalPlayers?.map((player) => player.display_name).join(",") ?? ""}</p>
        <p>{props.identitySeason}</p>
        <p>{props.identityLinks?.map((link) => link.profileId).join(",") ?? ""}</p>
        <p>{props.identityProfiles?.map((profile) => profile.displayName).join(",") ?? ""}</p>
        {props.isAdmin ? <button type="button">Edit Player Pool</button> : null}
      </div>
    );
  },
}));

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return builder;
}

describe("AcademyPlayersPage", () => {
  afterEach(() => {
    cleanup();
    createServerSupabase.mockReset();
    fetchAcademyDraftData.mockReset();
    fetchAcademyPlayers.mockReset();
    directoryProps.mockReset();
  });

  it("loads academy canonical player-pool rows and enables editing for admins", async () => {
    const playerPoolQuery = query({
      data: [
        {
          id: "academy-1",
          season_key: "academy-1",
          display_name: "Academy Canon",
          role: "top",
          rank: "E1",
          opgg_url: "https://op.gg/academy-canon",
        },
      ],
      error: null,
    });
    const profileQuery = query({ data: { is_admin: true }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "player_pool") return playerPoolQuery;
      if (table === "league_settings") {
        return query({ data: { current_season: "S5", academy_season: "A1" }, error: null });
      }
      if (table === "player_identity_links") return query({ data: [], error: null });
      if (table === "profiles") {
        return {
          select: (columns: string) => columns === "is_admin"
            ? profileQuery
            : query({ data: [], error: null }),
        };
      }
      return query({ data: null, error: null });
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
      from,
    });
    fetchAcademyDraftData.mockResolvedValue({ draft: null, players: [], teams: [], profiles: [] });
    fetchAcademyPlayers.mockResolvedValue([]);

    render(await AcademyPlayersPage());

    expect(from).toHaveBeenCalledWith("player_pool");
    expect(playerPoolQuery.eq).toHaveBeenCalledWith("season_key", "academy-1");
    expect(profileQuery.eq).toHaveBeenCalledWith("id", "admin-1");
    expect(directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPlayers: [
          expect.objectContaining({ display_name: "Academy Canon", season_key: "academy-1" }),
        ],
        isAdmin: true,
        poolSeasonKey: "academy-1",
      }),
    );
    expect(screen.getByRole("button", { name: "Edit Player Pool" })).toBeTruthy();
  });

  it("keeps academy player-pool editing hidden for non-admins", async () => {
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        return query({
          data: [
            {
              id: "academy-1",
              season_key: "academy-1",
              display_name: "Academy Canon",
              role: "top",
              rank: "E1",
              opgg_url: "https://op.gg/academy-canon",
            },
          ],
          error: null,
        });
      }

      if (table === "league_settings") {
        return query({ data: { current_season: "S5", academy_season: "A1" }, error: null });
      }

      return query({ data: null, error: null });
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });
    fetchAcademyDraftData.mockResolvedValue({ draft: null, players: [], teams: [], profiles: [] });
    fetchAcademyPlayers.mockResolvedValue([]);

    render(await AcademyPlayersPage());

    expect(screen.queryByRole("button", { name: "Edit Player Pool" })).toBeNull();
    expect(from).not.toHaveBeenCalledWith("player_identity_links");
    expect(directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        isAdmin: false,
        identitySeason: undefined,
        identityLinks: undefined,
        identityProfiles: undefined,
      }),
    );
  });

  it("passes active Academy identity data to the admin editor", async () => {
    const playerPoolQuery = query({
      data: [
        {
          id: "academy-player-1",
          season_key: "academy-1",
          display_name: "Academy Canon",
          role: "top",
          rank: "E1",
          opgg_url: "https://op.gg/academy-canon",
        },
      ],
      error: null,
    });
    const identityQuery = query({
      data: [
        {
          id: "academy-link-1",
          player_pool_id: "academy-player-1",
          profile_id: "profile-2",
          status: "pending",
        },
      ],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "player_pool") return playerPoolQuery;
      if (table === "league_settings") {
        return query({ data: { current_season: "S5", academy_season: "A2" }, error: null });
      }
      if (table === "player_identity_links") return identityQuery;
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            if (columns === "is_admin") {
              return query({ data: { is_admin: true }, error: null });
            }
            return query({
              data: [{ id: "profile-2", display_name: "Academy Verified", discord_id: "333333" }],
              error: null,
            });
          },
        };
      }
      return query({ data: null, error: null });
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
      from,
    });
    fetchAcademyDraftData.mockResolvedValue({ draft: null, players: [], teams: [], profiles: [] });
    fetchAcademyPlayers.mockResolvedValue([]);

    render(await AcademyPlayersPage());

    expect(identityQuery.eq).toHaveBeenCalledWith("league", "academy");
    expect(identityQuery.eq).toHaveBeenCalledWith("season", "A2");
    expect(directoryProps).toHaveBeenCalledWith(
      expect.objectContaining({
        identitySeason: "A2",
        identityLinks: [
          expect.objectContaining({ id: "academy-link-1", profileId: "profile-2", status: "pending" }),
        ],
        identityProfiles: [
          { id: "profile-2", displayName: "Academy Verified", discordId: "333333" },
        ],
      }),
    );
  });
});
