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
  default: ({
    foilType,
    card,
    preview,
  }: {
    foilType: string;
    card: { name: string };
    preview?: { label: string; layers?: string[] } | null;
  }) => (
    <div
      data-testid="card"
      data-foil={foilType}
      data-preview={preview?.label ?? ""}
      data-layers={preview?.layers?.join(" ") ?? ""}
    >
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

const previewed = () => screen.getAllByTestId("card").filter((node) => node.getAttribute("data-preview"));

describe("the skin-line mockup page", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false });
    fetchAllCardSeasons.mockResolvedValue([]);
    await SkinLinesPreviewPage();
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("draws every candidate line at all four tiers, on real cards, never as a minted type", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    const labels = previewed().map((node) => node.getAttribute("data-preview"));
    for (const line of ["PROJECT", "Harrowing", "Academy", "Arcade", "Arcana", "Battlecast"]) {
      for (const tier of ["", " Chroma", " Prestige", " Ultimate"]) {
        expect(labels).toContain(`${line}${tier}`);
      }
    }
    // No card is ever asked for a foil type off the real ladder — and never
    // Eclipse, which the proposal leaves alone.
    const foils = new Set(screen.getAllByTestId("card").map((node) => node.getAttribute("data-foil")));
    expect([...foils].sort()).toEqual(["aurora", "ice", "prisma", "refractor"]);
  });

  it("puts each tier on the rung of the parallel it replaces", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    const rungOf = (label: string) =>
      new Set(previewed().filter((node) => node.getAttribute("data-preview") === label).map((node) => node.getAttribute("data-foil")));
    expect(rungOf("PROJECT")).toEqual(new Set(["prisma"]));
    expect(rungOf("PROJECT Chroma")).toEqual(new Set(["aurora"]));
    expect(rungOf("PROJECT Prestige")).toEqual(new Set(["refractor"]));
    expect(rungOf("PROJECT Ultimate")).toEqual(new Set(["ice"]));
    // The base tier is the line alone; the top tier wears every overlay.
    const layersOf = (label: string) => previewed().find((node) => node.getAttribute("data-preview") === label)!.getAttribute("data-layers");
    expect(layersOf("PROJECT")).toBe("");
    expect(layersOf("PROJECT Ultimate")).toContain("card-foil-tier-ultimate");
  });

  it("puts today's ladder beside the proposed season on the same card", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    expect(screen.getByText("Today · Prisma")).toBeTruthy();
    expect(screen.getByText("Today · Cracked Ice")).toBeTruthy();
    expect(screen.getAllByText(/^Proposed · /)).toHaveLength(4);
  });

  it("says it is a preview, recommends a cadence, and leaves Eclipse alone", async () => {
    staff();
    render(await SkinLinesPreviewPage());
    expect(screen.getByText(/Preview only/)).toBeTruthy();
    expect(screen.getByText(/Per season, not per week/)).toBeTruthy();
    expect(screen.getByText(/Eclipse is untouched/)).toBeTruthy();
  });
});
