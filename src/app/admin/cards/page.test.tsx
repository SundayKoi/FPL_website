import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, fetchStaffTier, createBettingServiceClient, createServerSupabase } = vi.hoisted(() => ({
  redirect: vi.fn(),
  fetchStaffTier: vi.fn(),
  createBettingServiceClient: vi.fn(),
  createServerSupabase: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));

import AdminCardsPage from "./page";

describe("AdminCardsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServerSupabase.mockResolvedValue({});
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    redirect.mockImplementation(() => { throw new Error("redirected"); });
  });

  it("rejects non-owners before opening the service-role card data client", async () => {
    await expect(AdminCardsPage()).rejects.toThrow("redirected");

    expect(redirect).toHaveBeenCalledWith("/admin");
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });
});
