import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, fetchStaffTier, fetchChampionSkinCatalog } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
  fetchChampionSkinCatalog: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/packs/skins", () => ({ fetchChampionSkinCatalog }));

import { fetchOnAirSkinCatalogAction } from "./onAir-actions";

const client = { marker: "cookie-bound" };

beforeEach(() => {
  createServerSupabase.mockReset();
  createServerSupabase.mockResolvedValue(client);
  fetchStaffTier.mockReset();
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  fetchChampionSkinCatalog.mockReset();
  fetchChampionSkinCatalog.mockResolvedValue({
    champion: "Ahri",
    skins: [
      { num: 0, name: "Original" },
      { num: 7, name: "Foxfire Ahri" },
    ],
    available: true,
  });
});

describe("fetchOnAirSkinCatalogAction", () => {
  it("refuses a caller who is neither admin nor owner, and never reads Riot", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });

    expect(await fetchOnAirSkinCatalogAction("Ahri")).toEqual({ ok: false, error: "Admins only." });
    expect(fetchChampionSkinCatalog).not.toHaveBeenCalled();
  });

  it("lets an owner who is not flagged admin through", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });

    const result = await fetchOnAirSkinCatalogAction("Ahri");

    expect(result.ok).toBe(true);
    // The gate asks the caller's OWN session, through the cookie-bound client.
    expect(fetchStaffTier).toHaveBeenCalledWith(client);
  });

  it("refuses a champion Riot has never heard of", async () => {
    expect(await fetchOnAirSkinCatalogAction("Definitely Not A Champion")).toEqual({
      ok: false,
      error: "Unknown champion.",
    });
    expect(fetchChampionSkinCatalog).not.toHaveBeenCalled();
  });

  it("returns the catalog under the canonical champion name", async () => {
    const result = await fetchOnAirSkinCatalogAction("  ahri ");

    expect(fetchChampionSkinCatalog).toHaveBeenCalledWith("Ahri");
    expect(result).toEqual({
      ok: true,
      champion: "Ahri",
      available: true,
      skins: [
        { num: 0, name: "Original" },
        { num: 7, name: "Foxfire Ahri" },
      ],
    });
  });

  it("passes on an unreadable catalog as available: false rather than as a failure", async () => {
    fetchChampionSkinCatalog.mockResolvedValue({
      champion: "Ahri",
      skins: [{ num: 0, name: "Original" }],
      available: false,
    });

    expect(await fetchOnAirSkinCatalogAction("Ahri")).toEqual({
      ok: true,
      champion: "Ahri",
      available: false,
      skins: [{ num: 0, name: "Original" }],
    });
  });
});
