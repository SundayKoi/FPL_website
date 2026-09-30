import { describe, expect, it, vi } from "vitest";
import { draftRosterClaimEntries, fetchRosterClaimStates, loadRosterClaimTargets } from "./rosterClaims";

type OwnRow = { id: string; player_pool_id: string; status: "pending" | "approved" } | null;

function clientFor(
  states: Record<string, "unclaimed" | "pending" | "claimed">,
  ownRow: OwnRow = null,
  errors: { rpcPlayerId?: string; own?: { message: string } } = {},
) {
  const rpc = vi.fn(async (_name: string, args: { p_player_pool_id: string }) => ({
    data: states[args.p_player_pool_id] ?? "unclaimed",
    error: args.p_player_pool_id === errors.rpcPlayerId ? { message: "rpc unavailable" } : null,
  }));
  const result = { data: errors.own ? null : ownRow, error: errors.own ?? null };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  const from = vi.fn(() => query);
  return { client: { rpc, from }, rpc, from, query };
}

const roster = [
  { id: "draft-1", canonicalPlayerId: "pool-1" },
  { id: "draft-2", canonicalPlayerId: "pool-2" },
  { id: "empty", canonicalPlayerId: null },
];

describe("fetchRosterClaimStates", () => {
  it("uses only the sanitized public helper for a signed-out roster", async () => {
    const { client, rpc, from } = clientFor({ "pool-1": "claimed", "pool-2": "pending" });

    await expect(fetchRosterClaimStates(client as never, roster, "premier", "S5", null)).resolves.toEqual({
      "draft-1": { state: "claimed", claimLinkId: null },
      "draft-2": { state: "pending", claimLinkId: null },
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
  });

  it("separately reads only the signed-in viewer's own pending identity", async () => {
    const { client, query } = clientFor(
      { "pool-1": "pending", "pool-2": "unclaimed" },
      { id: "link-1", player_pool_id: "pool-1", status: "pending" },
    );

    const result = await fetchRosterClaimStates(client as never, roster, "premier", "S5", "profile-1");

    expect(query.select).toHaveBeenCalledWith("id, player_pool_id, status");
    expect(query.eq).toHaveBeenCalledWith("profile_id", "profile-1");
    expect(result).toEqual({
      "draft-1": { state: "mine-pending", claimLinkId: "link-1" },
      "draft-2": { state: "unclaimed", claimLinkId: null },
    });
    expect(JSON.stringify(result)).not.toContain("profile-1");
  });

  it("marks only the viewer's matching approved canonical player as theirs", async () => {
    const { client } = clientFor(
      { "pool-1": "claimed", "pool-2": "claimed" },
      { id: "link-2", player_pool_id: "pool-2", status: "approved" },
    );

    await expect(fetchRosterClaimStates(client as never, roster, "academy", "A1", "profile-2"))
      .resolves.toEqual({
        "draft-1": { state: "claimed", claimLinkId: null },
        "draft-2": { state: "mine-approved", claimLinkId: null },
      });
  });

  it("rejects instead of presenting an RPC outage as an unclaimed roster spot", async () => {
    const { client } = clientFor({}, null, { rpcPlayerId: "pool-1" });

    await expect(fetchRosterClaimStates(client as never, roster, "premier", "S5", null))
      .rejects.toThrow("Roster claim status is unavailable");
  });

  it("rejects instead of hiding a signed-in viewer identity read failure", async () => {
    const { client } = clientFor({}, null, { own: { message: "identity read unavailable" } });

    await expect(fetchRosterClaimStates(client as never, roster, "premier", "S5", "profile-1"))
      .rejects.toThrow("Roster claim status is unavailable");
  });
});

describe("draftRosterClaimEntries", () => {
  const teams = [
    { id: "draft-team-1", name: "Academy Wolves" },
    { id: "draft-team-2", name: "Retired Owls" },
  ];
  const activeLeagueTeams = [{ id: "league-team-1", name: " academy wolves " }];

  it("targets canonical players whose draft team is an active league team", () => {
    const entries = draftRosterClaimEntries(
      [
        { canonical_player_id: "pool-1", team_id: "draft-team-1" },
        { canonical_player_id: "pool-1", team_id: "draft-team-1" },
        { canonical_player_id: "pool-2", team_id: "draft-team-2" },
        { canonical_player_id: null, team_id: "draft-team-1" },
        { canonical_player_id: "pool-3", team_id: null },
      ],
      teams,
      activeLeagueTeams,
      (teamName) => `/academy/teams/${teamName}`,
    );

    expect(entries).toEqual([
      { playerPoolId: "pool-1", leagueTeamId: "league-team-1", returnPath: "/academy/teams/Academy Wolves" },
    ]);
  });
});

describe("loadRosterClaimTargets", () => {
  const entries = [{ playerPoolId: "pool-1", leagueTeamId: "league-team-1", returnPath: "/academy/players" }];

  it("returns no targets without a season", async () => {
    const { client, rpc } = clientFor({});

    await expect(loadRosterClaimTargets(client as never, entries, "academy", null, null)).resolves.toEqual({});
    expect(rpc).not.toHaveBeenCalled();
  });

  it("marks targets unavailable when the claim state cannot be read", async () => {
    const { client } = clientFor({}, null, { rpcPlayerId: "pool-1" });

    await expect(loadRosterClaimTargets(client as never, entries, "academy", "A2", "profile-1")).resolves.toEqual({
      "pool-1": {
        ...entries[0],
        league: "academy",
        season: "A2",
        signedIn: true,
        unavailable: true,
        state: "unclaimed",
        claimLinkId: null,
      },
    });
  });
});
