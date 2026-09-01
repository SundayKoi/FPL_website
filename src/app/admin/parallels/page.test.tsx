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
  default: ({ foilType, card }: { foilType: string; card: { name: string } }) => (
    <div data-testid="card" data-foil={foilType}>{card.name}</div>
  ),
}));

const ParallelsPreviewPage = (await import("./page")).default;

afterEach(cleanup);

const card = (name: string, overall: number) =>
  ({ slug: name.toLowerCase(), name, overall, tier: { key: "gold", label: "Gold" } }) as never;

describe("the parallels preview", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([]);
    fetchCardEditionWeeks.mockResolvedValue([]);
    fetchEditionCards.mockResolvedValue([]);
    render(await ParallelsPreviewPage());
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("shows every parallel, including the one that cannot be pulled", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    fetchEditionCards.mockResolvedValue([card("Doug", 92), card("Ana", 88)]);

    render(await ParallelsPreviewPage());
    const foils = new Set([...screen.getAllByTestId("card")].map((node) => node.dataset.foil));
    expect(foils).toEqual(new Set(["prisma", "aurora", "refractor", "ice", "eclipse"]));
  });

  it("says outright that Eclipse cannot be pulled", async () => {
    // The whole safety claim of this page. If the copy ever stops saying
    // it, somebody will assume the preview is live.
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    fetchEditionCards.mockResolvedValue([card("Doug", 92)]);

    render(await ParallelsPreviewPage());
    expect(screen.getByText(/cannot be pulled/i)).toBeTruthy();
    expect(screen.getByText(/Preview only/i)).toBeTruthy();
  });

  it("features the best cards, so a parallel is judged over real art", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    // Four cards for three slots, so the slice actually has to drop one.
    fetchEditionCards.mockResolvedValue([
      card("Lowest", 55),
      card("High", 95),
      card("Mid", 80),
      card("Second", 90),
    ]);

    render(await ParallelsPreviewPage());
    expect(screen.getAllByText("High").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Lowest")).toHaveLength(0);
  });
});
