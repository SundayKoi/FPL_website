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

import PlayerClaimsPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlayerClaimsPage", () => {
  it("sends signed-out reviewers to login and back to the admin fixture", async () => {
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });

    render(await PlayerClaimsPage());

    expect(screen.getByRole("heading", { name: /sign in to review player claims/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href"))
      .toBe("/login?redirect=/admin/claims");
    expect(fetchStaffTier).not.toHaveBeenCalled();
    expect(fetchAllCardSeasons).not.toHaveBeenCalled();
  });

  it("renders the moved queue shell for a signed-in reviewer", async () => {
    createServerSupabase.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "captain-1" } } })) },
    });
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([]);

    render(await PlayerClaimsPage());

    expect(screen.getByRole("heading", { name: "Player claims" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to admin/i }).getAttribute("href"))
      .toBe("/admin");
    expect(screen.getByText(/No pending player claims/)).toBeTruthy();
  });
});
