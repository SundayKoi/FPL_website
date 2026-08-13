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

import RulebookPage from "./page";

describe("RulebookPage", () => {
  afterEach(cleanup);

  it("renders the standalone Rulebook document", async () => {
    render(await RulebookPage());

    expect(screen.getByRole("heading", { name: "Rulebook", level: 1 })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Rulebook sections" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "League Structure" }).getAttribute("href")).toBe(
      "#league-structure",
    );
    expect(screen.getByRole("link", { name: /open source google doc/i }).getAttribute("href")).toBe(
      "https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7",
    );
    expect(
      screen
        .getByRole("link", { name: /back to rulebook sections/i })
        .getAttribute("href"),
    ).toBe("#rulebook-sections");
  });
});
