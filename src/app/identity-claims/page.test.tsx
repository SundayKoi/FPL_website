import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, fetchStaffTier } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import IdentityClaimsPage from "./page";

type ClaimRow = {
  id: string;
  player_pool_id: string;
  profile_id: string;
  league_team_id: string;
  league: "premier" | "academy";
  season: string;
  source: "team" | "card" | "admin";
  requested_at: string;
};

function query(result: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function clientFor(
  rows: ClaimRow[],
  userId = "captain-1",
  captainAssignments = [{ league_team_id: "team-own", season: "S5" }],
  errors: { claims?: { message: string }; captains?: { message: string } } = {},
) {
  const names = {
    "pool-own": "Own Mid",
    "pool-other": "Other ADC",
  } as Record<string, string>;
  const teams = {
    "team-own": "Mint Ice Cubes",
    "team-other": "Fraudulent Five",
  } as Record<string, string>;
  const profiles = {
    "claimant-own": "Own Claimant",
    "claimant-other": "Other Claimant",
  } as Record<string, string>;
  const claimsQuery = query({ data: errors.claims ? null : rows, error: errors.claims ?? null });
  const captainsQuery = query({
    data: errors.captains ? null : captainAssignments,
    error: errors.captains ?? null,
  });
  const from = vi.fn((table: string) => {
    if (table === "player_identity_links") return claimsQuery;
    if (table === "league_team_captains") return captainsQuery;
    if (table === "player_pool") {
      return query({ data: Object.entries(names).map(([id, display_name]) => ({ id, display_name })), error: null });
    }
    if (table === "league_teams") {
      return query({ data: Object.entries(teams).map(([id, name]) => ({ id, name })), error: null });
    }
    if (table === "profiles") {
      return query({ data: Object.entries(profiles).map(([id, display_name]) => ({ id, display_name })), error: null });
    }
    throw new Error(`Unexpected table ${table}`);
  });
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
      from,
    },
    claimsQuery,
  };
}

const ownClaim: ClaimRow = {
  id: "claim-own",
  player_pool_id: "pool-own",
  profile_id: "claimant-own",
  league_team_id: "team-own",
  league: "premier",
  season: "S5",
  source: "team",
  requested_at: "2026-08-25T10:00:00Z",
};

const otherClaim: ClaimRow = {
  id: "claim-other",
  player_pool_id: "pool-other",
  profile_id: "claimant-other",
  league_team_id: "team-other",
  league: "premier",
  season: "S5",
  source: "team",
  requested_at: "2026-08-25T11:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IdentityClaimsPage", () => {
  it("sends signed-out reviewers through login and back to the inbox", async () => {
    const { client } = clientFor([], "");
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href"))
      .toBe("/login?redirect=/identity-claims");
  });

  it("links reviewers to player claims in the admin fixture", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    const { client } = clientFor([], "admin-1", []);
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.getByRole("link", { name: /card-only claims/i }).getAttribute("href"))
      .toBe("/admin/claims");
  });

  it("renders only the captain's own-team rows returned by identity RLS", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const { client, claimsQuery } = clientFor([ownClaim, otherClaim]);
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(claimsQuery.eq).toHaveBeenCalledWith("status", "pending");
    expect(screen.getByText("Own Mid")).toBeTruthy();
    expect(screen.getByText(/Mint Ice Cubes/)).toBeTruthy();
    expect(screen.queryByText("Other ADC")).toBeNull();
  });

  it("renders every team's pending row when admin RLS returns all teams", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    const { client } = clientFor([ownClaim, otherClaim], "admin-1", []);
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.getByText("Own Mid")).toBeTruthy();
    expect(screen.getByText("Other ADC")).toBeTruthy();
    expect(screen.getByText(/Mint Ice Cubes/)).toBeTruthy();
    expect(screen.getByText(/Fraudulent Five/)).toBeTruthy();
  });

  it("does not present an ordinary claimant's self-readable row as an actionable inbox item", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const { client } = clientFor([ownClaim], "claimant-own", []);
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.queryByText("Own Mid")).toBeNull();
    expect(screen.getByText(/No pending roster identity claims/)).toBeTruthy();
  });

  it("does not present a current claimant's row using their captain assignment from a prior season", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const { client } = clientFor(
      [ownClaim],
      "claimant-own",
      [{ league_team_id: "team-own", season: "S4" }],
    );
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.queryByText("Own Mid")).toBeNull();
    expect(screen.getByText(/No pending roster identity claims/)).toBeTruthy();
  });

  it("shows a retryable unavailable state when the pending-claims read fails", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const { client } = clientFor([], "captain-1", [], { claims: { message: "network unavailable" } });
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.getByText(/Identity claims are unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/all caught up/i)).toBeNull();
  });

  it("shows a retryable unavailable state when captain assignments cannot be read", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    const { client } = clientFor([], "captain-1", [], { captains: { message: "network unavailable" } });
    createServerSupabase.mockResolvedValue(client);

    render(await IdentityClaimsPage());

    expect(screen.getByText(/Identity claims are unavailable/i)).toBeTruthy();
    expect(screen.queryByText(/all caught up/i)).toBeNull();
  });
});
