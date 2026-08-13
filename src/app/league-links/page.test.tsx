import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: () => ({
      select: () => ({
        order: async () => ({ data: null }),
        eq: () => ({ single: async () => ({ data: null }) }),
      }),
    }),
  })),
}));

import LeagueLinksPage from "./page";

describe("LeagueLinksPage", () => {
  afterEach(cleanup);

  it("renders league resource links without the Rulebook card", async () => {
    render(await LeagueLinksPage());

    expect(screen.getByRole("heading", { name: "League Links", level: 1 })).toBeTruthy();
    expect(screen.getByRole("region", { name: "League resources" }).id).toBe("league-resources");
    expect(screen.getByRole("heading", { name: "Payment", level: 2 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "MasterDoc", level: 2 })).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Rulebook resource" })).toBeNull();
  });
});
