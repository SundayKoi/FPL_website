import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase } = vi.hoisted(() => ({ createServerSupabase: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

import { approveCardClaim, requestCardClaim } from "./claimActions";

type Candidate = { id: string; normalized_name: string };

function cardClaimClient({
  userId = "profile-1",
  settings = { current_season: "S5", academy_season: "A1" },
  candidates = [{ id: "pool-1", normalized_name: "chaseworthy" }],
  insertError = null,
  rpcError = null,
}: {
  userId?: string | null;
  settings?: { current_season: string | null; academy_season: string | null };
  candidates?: Candidate[];
  insertError?: { message: string } | null;
  rpcError?: { message: string } | null;
} = {}) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const settingsQuery = {
    select: vi.fn(() => settingsQuery),
    eq: vi.fn(() => settingsQuery),
    maybeSingle: vi.fn(async () => ({ data: settings, error: null })),
  };
  const candidatesResult = { data: candidates, error: null };
  const candidatesQuery = {
    select: vi.fn(() => candidatesQuery),
    eq: vi.fn(() => candidatesQuery),
    then: (resolve: (value: typeof candidatesResult) => unknown) => Promise.resolve(candidatesResult).then(resolve),
  };
  const from = vi.fn((table: string) => {
    if (table === "league_settings") return settingsQuery;
    if (table === "player_pool") return candidatesQuery;
    if (table === "card_claims") return { insert };
    throw new Error(`Unexpected table ${table}`);
  });
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }));
  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
      from,
      rpc,
    },
    insert,
    settingsQuery,
    candidatesQuery,
    rpc,
  };
}

beforeEach(() => vi.resetAllMocks());

describe("card claim actions", () => {
  it("stores an exact unique canonical mapping from the configured league season", async () => {
    const { client, insert, candidatesQuery } = cardClaimClient();
    createServerSupabase.mockResolvedValue(client);

    await expect(requestCardClaim({ season: "S5", summonerName: "Chaseworthy", tag: "NA1" }))
      .resolves.toEqual({ ok: true });

    expect(candidatesQuery.eq).toHaveBeenCalledWith("season_key", "season-5");
    expect(insert).toHaveBeenCalledWith({
      season: "S5",
      summoner_name: "Chaseworthy",
      tag: "NA1",
      profile_id: "profile-1",
      player_pool_id: "pool-1",
    });
  });

  it("stores null when no canonical player matches so approval remains card-only", async () => {
    const { client, insert } = cardClaimClient({ candidates: [] });
    createServerSupabase.mockResolvedValue(client);

    await requestCardClaim({ season: "S5", summonerName: "Missing", tag: "NA1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ player_pool_id: null }));
  });

  it("stores null for an ambiguous canonical match so no team identity can be granted", async () => {
    const { client, insert } = cardClaimClient({
      candidates: [
        { id: "pool-1", normalized_name: "chaseworthy" },
        { id: "pool-2", normalized_name: "chaseworthy" },
      ],
    });
    createServerSupabase.mockResolvedValue(client);

    await requestCardClaim({ season: "S5", summonerName: "Chaseworthy", tag: "NA1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ player_pool_id: null }));
  });

  it("does not use an alias-only normalized-name guess for private identity", async () => {
    const { client, insert } = cardClaimClient({
      candidates: [{ id: "pool-1", normalized_name: "flying squirtle" }],
    });
    createServerSupabase.mockResolvedValue(client);

    await requestCardClaim({ season: "S5", summonerName: "Flyinq Squirtle", tag: "NA1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ player_pool_id: null }));
  });

  it("stores null when the card season does not identify exactly one configured league", async () => {
    const { client, insert } = cardClaimClient({
      settings: { current_season: "SAME", academy_season: "SAME" },
    });
    createServerSupabase.mockResolvedValue(client);

    await requestCardClaim({ season: "SAME", summonerName: "Chaseworthy", tag: "NA1" });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ player_pool_id: null }));
  });

  it("approves only through approve_card_claim so compatible identity synchronization stays atomic", async () => {
    const { client, rpc } = cardClaimClient();
    createServerSupabase.mockResolvedValue(client);

    await expect(approveCardClaim({ season: "S5", summonerName: "Chaseworthy", tag: "NA1" }))
      .resolves.toEqual({ ok: true });

    expect(rpc).toHaveBeenCalledWith("approve_card_claim", {
      p_season: "S5",
      p_summoner: "Chaseworthy",
      p_tag: "NA1",
    });
  });

  it("does not expose an approval RPC error", async () => {
    const { client } = cardClaimClient({ rpcError: { message: "PLAYER_IDENTITY_CONFLICT" } });
    createServerSupabase.mockResolvedValue(client);

    await expect(approveCardClaim({ season: "S5", summonerName: "Chaseworthy", tag: "NA1" }))
      .resolves.toEqual({ ok: false, error: "Unable to update card claim" });
  });

  it("rejects a signed-out request before inserting", async () => {
    const { client, insert } = cardClaimClient({ userId: null });
    createServerSupabase.mockResolvedValue(client);

    await expect(requestCardClaim({ season: "S5", summonerName: "Chaseworthy", tag: "NA1" }))
      .resolves.toEqual({ ok: false, error: "Unable to update card claim" });
    expect(insert).not.toHaveBeenCalled();
  });
});
