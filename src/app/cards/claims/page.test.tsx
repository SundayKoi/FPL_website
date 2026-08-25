import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { createServerSupabase, fetchStaffTier, fetchAllCardSeasons } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
  fetchAllCardSeasons: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/cards/queries", () => ({ fetchAllCardSeasons }));

import ClaimApprovalsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClaimApprovalsPage", () => {
  it("links reviewers to the unified roster identity inbox while retaining card approvals", async () => {
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "captain-1" } } })) },
    });
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([]);

    render(await ClaimApprovalsPage());

    expect(screen.getByRole("heading", { name: "Claim approvals" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /roster identity claims/i }).getAttribute("href"))
      .toBe("/identity-claims");
    expect(screen.getByText(/No pending claims/)).toBeTruthy();
  });
});
