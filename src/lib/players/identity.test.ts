import { describe, expect, it, vi } from "vitest";
import { resolvePlayerIdentity } from "./identity";

type QueryResult = { data: unknown; error?: unknown };

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return chain;
}

function clientFor({
  userId = "profile-1",
  season = "S5",
  academySeason = "A1",
  profile = { is_admin: false },
  captainRows = [],
  link = null,
}: {
  userId?: string | null;
  season?: string;
  academySeason?: string;
  profile?: { is_admin: boolean } | null;
  captainRows?: { league_team_id: string }[];
  link?: { id: string; player_pool_id: string; league_team_id: string | null; status: "pending" | "approved" } | null;
}) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from: vi.fn((table: string) => {
      if (table === "league_settings") return query({ data: { current_season: season, academy_season: academySeason } });
      if (table === "profiles") return query({ data: profile });
      if (table === "league_team_captains") return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(async () => ({ data: captainRows })) })) })) };
      if (table === "player_identity_links") return query({ data: link });
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

describe("resolvePlayerIdentity", () => {
  it("returns the caller's approved Premier link", async () => {
    const client = clientFor({
      link: { id: "link-1", player_pool_id: "pool-1", league_team_id: "team-1", status: "approved" },
    });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toEqual({
      profileId: "profile-1",
      status: "approved",
      linkId: "link-1",
      playerPoolId: "pool-1",
      leagueTeamId: "team-1",
      season: "S5",
      isCaptain: false,
      isAdmin: false,
    });
  });

  it("returns signed-out callers as unlinked without querying a private link", async () => {
    const client = clientFor({ userId: null });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      profileId: null,
      status: "unlinked",
      linkId: null,
      playerPoolId: null,
      leagueTeamId: null,
      season: "S5",
      isCaptain: false,
      isAdmin: false,
    });
    expect(client.from).not.toHaveBeenCalledWith("player_identity_links");
  });

  it("keeps an authenticated caller with no link unlinked", async () => {
    const client = clientFor({ link: null });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      profileId: "profile-1",
      status: "unlinked",
      linkId: null,
      playerPoolId: null,
      leagueTeamId: null,
    });
  });

  it("returns pending links without granting roster access", async () => {
    const client = clientFor({
      link: { id: "link-1", player_pool_id: "pool-1", league_team_id: "team-1", status: "pending" },
    });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      status: "pending",
      leagueTeamId: "team-1",
    });
  });

  it("marks an approved identity without a team as unrostered", async () => {
    const client = clientFor({
      link: { id: "link-1", player_pool_id: "pool-1", league_team_id: null, status: "approved" },
    });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      status: "approved_unrostered",
      leagueTeamId: null,
    });
  });

  it("preserves captain context without a player identity", async () => {
    const client = clientFor({ captainRows: [{ league_team_id: "team-1" }] });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      status: "unlinked",
      isCaptain: true,
    });
  });

  it("preserves admin context without a player identity", async () => {
    const client = clientFor({ profile: { is_admin: true } });

    await expect(resolvePlayerIdentity(client as never, "premier")).resolves.toMatchObject({
      status: "unlinked",
      isAdmin: true,
    });
  });

  it("uses Academy's distinct season when resolving an Academy link", async () => {
    const client = clientFor({
      link: { id: "academy-link", player_pool_id: "academy-pool", league_team_id: "academy-team", status: "approved" },
    });

    await expect(resolvePlayerIdentity(client as never, "academy")).resolves.toMatchObject({
      linkId: "academy-link",
      season: "A1",
      leagueTeamId: "academy-team",
    });
  });
});
