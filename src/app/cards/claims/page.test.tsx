import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect, fetchStaffTier } = vi.hoisted(() => ({
  redirect: vi.fn(),
  fetchStaffTier: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));

import ClaimApprovalsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the legacy cards claims URL", () => {
  it("sends a player to their own claim on the cards hub", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false });
    await ClaimApprovalsPage();
    expect(redirect).toHaveBeenCalledWith("/cards#claim");
  });

  it("still sends staff to the moderation queue", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false });
    await ClaimApprovalsPage();
    expect(redirect).toHaveBeenCalledWith("/admin/claims");
  });
});
