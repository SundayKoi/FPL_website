import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

import {
  assignPlayerIdentity,
  decidePlayerIdentityClaim,
  replacePlayerIdentity,
  requestPlayerIdentityClaim,
  revokePlayerIdentity,
  withdrawPlayerIdentityClaim,
} from "./identityActions";

function mutationClient({
  userId = "profile-1",
  insertResult = { error: null },
  updateResult = { data: [{ id: "link-1" }], error: null },
  deleteResult = { data: [{ id: "link-1" }], error: null },
  profile = { id: "profile-2" },
  currentSeason = "S5",
  academySeason = "A1",
  activeTeams = [{ id: "team-1" }],
  rosteredTeamIds = ["team-1"],
  rosterLookupErrorTeamIds = [],
}: {
  userId?: string | null;
  insertResult?: { error: { code?: string; message: string } | null };
  updateResult?: { data?: { id: string }[] | null; error: { code?: string; message: string } | null };
  deleteResult?: { data?: { id: string }[] | null; error: { code?: string; message: string } | null };
  profile?: { id: string } | null;
  currentSeason?: string;
  academySeason?: string;
  activeTeams?: { id: string }[];
  rosteredTeamIds?: string[];
  rosterLookupErrorTeamIds?: string[];
}) {
  const insert = vi.fn(async () => insertResult);
  const updateChain = mutationChain(updateResult);
  const update = vi.fn(() => updateChain);
  const remove = vi.fn(() => mutationChain(deleteResult));
  const profileQuery = {
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: profile, error: null })) })) })),
  };
  const settingsQuery = readChain({ current_season: currentSeason, academy_season: academySeason });
  const teamsQuery = readChain(activeTeams);
  const rpc = vi.fn(async (_functionName: string, params: { p_league_team_id: string }) => ({
    data: rosteredTeamIds.includes(params.p_league_team_id),
    error: rosterLookupErrorTeamIds.includes(params.p_league_team_id)
      ? { message: "roster lookup failed" }
      : null,
  }));
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    rpc,
    from: vi.fn((table: string) => {
      if (table === "player_identity_links") return { insert, update, delete: remove };
      if (table === "profiles") return profileQuery;
      if (table === "league_settings") return settingsQuery;
      if (table === "league_teams") return teamsQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return { client, insert, update, updateChain, remove, profileQuery, rpc };
}

function readChain(data: unknown) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data, error: null })),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return chain;
}

function mutationChain(result: { data?: { id: string }[] | null; error: { code?: string; message: string } | null }) {
  const chain: Record<string, unknown> = {
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

beforeEach(() => vi.resetAllMocks());

describe("player identity actions", () => {
  it("derives the requesting profile from the authenticated session", async () => {
    const { client, insert } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(requestPlayerIdentityClaim({
      playerPoolId: "pool-1", leagueTeamId: "team-1", league: "premier", season: "S5",
      profileId: "forged-profile",
    } as never)).resolves.toEqual({ ok: true });

    expect(insert).toHaveBeenCalledWith({
      player_pool_id: "pool-1",
      profile_id: "profile-1",
      league_team_id: "team-1",
      league: "premier",
      season: "S5",
      status: "pending",
      source: "team",
      requested_by: "profile-1",
    });
  });

  it("does not send cross-league claim fields to any alternate table", async () => {
    const { client, insert } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await requestPlayerIdentityClaim({ playerPoolId: "academy-pool", leagueTeamId: "academy-team", league: "academy", season: "A1" });

    expect(client.from).toHaveBeenCalledWith("player_identity_links");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      player_pool_id: "academy-pool", league_team_id: "academy-team", league: "academy", season: "A1",
    }));
  });

  it("rejects a malformed request before a database write", async () => {
    const { client, insert } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(requestPlayerIdentityClaim({ playerPoolId: "", leagueTeamId: "team-1", league: "premier", season: "S5" })).resolves.toEqual({
      ok: false,
      error: "Unable to update player identity",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("withdraws only the caller's pending identity request", async () => {
    const { client, remove } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(withdrawPlayerIdentityClaim("link-1")).resolves.toEqual({ ok: true });

    expect(remove).toHaveBeenCalled();
  });

  it("does not report a forged or cross-league link id as withdrawn when RLS filters it", async () => {
    const { client } = mutationClient({ deleteResult: { data: [], error: null } });
    createServerSupabase.mockResolvedValue(client);

    await expect(withdrawPlayerIdentityClaim("forged-link")).resolves.toEqual({
      ok: false,
      error: "Unable to update player identity",
    });
  });

  it("approves a selected pending request with the acting session profile", async () => {
    const { client, update } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(decidePlayerIdentityClaim({ linkId: "link-1", decision: "approve" })).resolves.toEqual({ ok: true });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved", decided_by: "profile-1" }));
  });

  it("rejects a selected request by deleting it", async () => {
    const { client, remove } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(decidePlayerIdentityClaim({ linkId: "link-1", decision: "reject" })).resolves.toEqual({ ok: true });
    expect(remove).toHaveBeenCalled();
  });

  it("links an existing selected profile to its one active roster team without accepting a Discord name", async () => {
    const { client, insert, profileQuery, rpc } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(assignPlayerIdentity({
      playerPoolId: "pool-1", profileId: "profile-2", league: "premier", season: "S5", discordName: "forged-name",
    } as never)).resolves.toEqual({ ok: true });

    expect(profileQuery.select).toHaveBeenCalledWith("id");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      player_pool_id: "pool-1",
      profile_id: "profile-2",
      league_team_id: "team-1",
      source: "admin",
      status: "approved",
      requested_by: "profile-1",
      decided_by: "profile-1",
    }));
    expect(rpc).toHaveBeenCalledWith("is_player_rostered_on_team", {
      p_player_pool_id: "pool-1",
      p_league_team_id: "team-1",
      p_league: "premier",
      p_season: "S5",
    });
  });

  it("safely rejects an admin assignment for an unrostered player", async () => {
    const { client, insert } = mutationClient({ rosteredTeamIds: [] });
    createServerSupabase.mockResolvedValue(client);

    await expect(assignPlayerIdentity({
      playerPoolId: "unrostered-pool", profileId: "profile-2", league: "premier", season: "S5",
    })).resolves.toEqual({ ok: false, error: "Unable to update player identity" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("safely rejects an admin assignment when the active roster match is ambiguous", async () => {
    const { client, insert } = mutationClient({
      activeTeams: [{ id: "team-1" }, { id: "team-2" }],
      rosteredTeamIds: ["team-1", "team-2"],
    });
    createServerSupabase.mockResolvedValue(client);

    await expect(assignPlayerIdentity({
      playerPoolId: "ambiguous-pool", profileId: "profile-2", league: "premier", season: "S5",
    })).resolves.toEqual({ ok: false, error: "Unable to update player identity" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("safely rejects an assignment when any active-team roster lookup errors", async () => {
    const { client, insert } = mutationClient({
      activeTeams: [{ id: "team-1" }, { id: "team-2" }],
      rosteredTeamIds: ["team-1"],
      rosterLookupErrorTeamIds: ["team-2"],
    });
    createServerSupabase.mockResolvedValue(client);

    await expect(assignPlayerIdentity({
      playerPoolId: "pool-1", profileId: "profile-2", league: "premier", season: "S5",
    })).resolves.toEqual({ ok: false, error: "Unable to update player identity" });

    expect(insert).not.toHaveBeenCalled();
  });

  it("replaces a link with one atomic update so a profile conflict preserves the old row", async () => {
    const { client, insert, update, updateChain, remove, profileQuery } = mutationClient({
      updateResult: {
        data: null,
        error: { code: "23505", message: "player_identity_links_profile_id_league_season_key" },
      },
    });
    createServerSupabase.mockResolvedValue(client);

    await expect(replacePlayerIdentity({ linkId: "link-1", profileId: "profile-2" })).resolves.toEqual({
      ok: false,
      error: "Profile already linked",
    });

    expect(profileQuery.select).toHaveBeenCalledWith("id");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: "profile-2",
      status: "approved",
      source: "admin",
      requested_by: "profile-1",
      decided_by: "profile-1",
    }));
    expect(updateChain.eq).toHaveBeenCalledWith("id", "link-1");
    expect(updateChain.select).toHaveBeenCalledWith("id");
    expect(insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("uses a friendly player conflict message", async () => {
    const { client } = mutationClient({
      insertResult: { error: { code: "23505", message: "player_identity_links_player_pool_id_league_season_key" } },
    });
    createServerSupabase.mockResolvedValue(client);

    await expect(requestPlayerIdentityClaim({ playerPoolId: "pool-1", leagueTeamId: "team-1", league: "premier", season: "S5" })).resolves.toEqual({
      ok: false,
      error: "Identity already linked",
    });
  });

  it("uses a friendly profile conflict message", async () => {
    const { client } = mutationClient({
      insertResult: { error: { code: "23505", message: "player_identity_links_profile_id_league_season_key" } },
    });
    createServerSupabase.mockResolvedValue(client);

    await expect(requestPlayerIdentityClaim({ playerPoolId: "pool-1", leagueTeamId: "team-1", league: "premier", season: "S5" })).resolves.toEqual({
      ok: false,
      error: "Profile already linked",
    });
  });

  it("does not expose database errors", async () => {
    const { client } = mutationClient({ insertResult: { error: { message: "permission denied for table player_identity_links" } } });
    createServerSupabase.mockResolvedValue(client);

    await expect(requestPlayerIdentityClaim({ playerPoolId: "pool-1", leagueTeamId: "team-1", league: "premier", season: "S5" })).resolves.toEqual({
      ok: false,
      error: "Unable to update player identity",
    });
  });

  it("revokes a link through the same authenticated mutation boundary", async () => {
    const { client, remove } = mutationClient({});
    createServerSupabase.mockResolvedValue(client);

    await expect(revokePlayerIdentity("link-1")).resolves.toEqual({ ok: true });
    expect(remove).toHaveBeenCalled();
  });
});
