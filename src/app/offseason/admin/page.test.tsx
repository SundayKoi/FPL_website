import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { loadOffseasonPage, redirect } = vi.hoisted(() => ({
  loadOffseasonPage: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/offseason/page", () => ({ loadOffseasonPage }));
vi.mock("@/lib/offseason/actions", () => ({ createEventAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import OffseasonAdminPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OffseasonAdminPage", () => {
  it("sends signed-out visitors to log in", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: null, isStaff: false, ownEntry: null });
    await expect(OffseasonAdminPage()).rejects.toThrow("REDIRECT /login?redirect=/offseason/admin");
  });

  it("sends players back to the public page", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: "player-1", isStaff: false, ownEntry: null });
    await expect(OffseasonAdminPage()).rejects.toThrow("REDIRECT /offseason");
  });

  it("offers staff the event form before there is an event", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: "admin-1", isStaff: true, ownEntry: null });
    render(await OffseasonAdminPage());
    expect(screen.getByRole("button", { name: "Create event" })).toBeTruthy();
  });
});
