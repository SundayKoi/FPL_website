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

  it("links admins to the dedicated Academy player workspace", async () => {
    const profileQuery = query({ data: { is_admin: true }, error: null });
    const from = vi.fn((table: string) => {
      if (table === "league_settings") {
        return query({ data: { current_season: "S5", academy_season: "A1" }, error: null });
      }
      if (table === "profiles") {
        return { select: (columns: string) => columns.includes("is_admin") ? profileQuery : query({ data: [], error: null }) };
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

    expect(from).not.toHaveBeenCalledWith("player_pool");
    expect(directoryProps).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false, poolSeasonKey: "academy-1" }));
    expect(screen.getByRole("link", { name: /manage the academy player pool in admin/i }).getAttribute("href"))
      .toBe("/admin/league/players?league=academy");
    expect(screen.queryByRole("button", { name: "Edit Player Pool" })).toBeNull();
  });

  it("keeps academy player-pool editing hidden for non-admins", async () => {
    const from = vi.fn((table: string) => {
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
    expect(directoryProps).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }));
  });

  it("keeps Academy identity administration in the dedicated player workspace", async () => {
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
      if (table === "league_settings") {
        return query({ data: { current_season: "S5", academy_season: "A2" }, error: null });
      }
      if (table === "profiles") {
        return {
          select: (columns: string) => {
            if (columns.includes("is_admin")) {
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

    expect(from).not.toHaveBeenCalledWith("player_identity_links");
    expect(identityQuery.eq).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /manage the academy player pool in admin/i }).getAttribute("href"))
      .toBe("/admin/league/players?league=academy");
    expect(directoryProps).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }));
  });
});
