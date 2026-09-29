import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

  it("renders the Rules page, responsive contents links, and source document", async () => {
    render(await RulebookPage());

    expect(screen.getByRole("heading", { name: "Rules", level: 1 })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Rulebook sections" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "League Structure" }).map((link) => link.getAttribute("href"))).toEqual([
      "#league-structure",
      "#league-structure",
    ]);
    expect(screen.getByRole("link", { name: /open source google doc/i }).getAttribute("href")).toBe(
      "https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7",
    );
    expect(screen.getByText("Rulebook sections").closest("details")).toBeTruthy();
  });
});
