import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayersPage from "./page";

// PlayersPage now fetches auth + free-agency bids server-side; cookies()
// (inside createServerSupabase) throws outside a real request scope, so the
// test supplies a minimal stub: signed-out user, no bids.
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: async () => ({ data: [] }),
    }),
  }),
}));

describe("PlayersPage", () => {
  afterEach(cleanup);

  it("renders the Season 5 player directory", async () => {
    render(await PlayersPage());

    expect(screen.getByRole("heading", { name: "Players", level: 1 })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Season 5" })).toBeTruthy();
    for (const role of ["Top", "Jungle", "Mid", "ADC", "Support"]) {
      expect(screen.getByRole("heading", { name: role, level: 2 })).toBeTruthy();
    }
  });
});
