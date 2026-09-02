import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchStaffTier, redirect, fetchAllCardSeasons, fetchCardEditionWeeks, fetchEditionCards } = vi.hoisted(() => ({
  fetchStaffTier: vi.fn(),
  redirect: vi.fn(),
  fetchAllCardSeasons: vi.fn(),
  fetchCardEditionWeeks: vi.fn(),
  fetchEditionCards: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: vi.fn(() => ({})) }));
vi.mock("@/lib/cards/queries", () => ({
  fetchAllCardSeasons,
  fetchCardEditionWeeks,
  fetchEditionCards,
  fetchCurrentWeekCards: vi.fn(async () => []),
}));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ foilType, card, preview }: { foilType: string; card: { name: string }; preview?: { label: string } | null }) => (
    <div data-testid="card" data-foil={foilType} data-preview={preview?.label ?? ""}>
      {card.name}
    </div>
  ),
}));

const SkinLinesPreviewPage = (await import("./page")).default;

afterEach(cleanup);

const card = (name: string, overall: number) =>
  ({ slug: name.toLowerCase(), name, overall, standout: false, tier: { key: "gold", label: "Gold" } }) as never;

function staff() {
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false });
  fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
  fetchCardEditionWeeks.mockResolvedValue(["2026-08-31"]);
  fetchEditionCards.mockResolvedValue([card("Chaseworthy", 92), card("Bystander", 75), card("Commonly", 60)]);
}

describe("the skin-line mockup page", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false });
    fetchAllCardSeasons.mockResolvedValue([]);
    await SkinLinesPreviewPage();
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("draws every candidate line on real cards, as a preview and never as a minted type", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    const previews = screen.getAllByTestId("card").map((node) => node.getAttribute("data-preview")).filter(Boolean);
    for (const label of ["PROJECT", "Harrowing", "Academy", "Arcade", "Arcana", "Battlecast"]) {
      expect(previews).toContain(label);
    }
    // No card is ever asked for a foil type off the real ladder.
    const foils = new Set(screen.getAllByTestId("card").map((node) => node.getAttribute("data-foil")));
    for (const foil of foils) expect(["aurora", "refractor", "ice"]).toContain(foil);
  });

  it("puts today's ladder beside the proposed set on the same card", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    expect(screen.getByText("Today · Aurora")).toBeTruthy();
    expect(screen.getByText("Today · Cracked Ice")).toBeTruthy();
    expect(screen.getAllByText(/^Proposed · /)).toHaveLength(3);
  });

  it("says it is a preview, and recommends a cadence", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    expect(screen.getByText(/Preview only/)).toBeTruthy();
    expect(screen.getByText(/Per season, not per week/)).toBeTruthy();
  });
});
