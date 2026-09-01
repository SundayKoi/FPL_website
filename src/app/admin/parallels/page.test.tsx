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

const card = (name: string, overall: number, standout = false) =>
  ({ slug: name.toLowerCase(), name, overall, standout, tier: { key: "gold", label: "Gold" } }) as never;

describe("the parallels preview", () => {
  it("turns away anyone who isn't staff", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([]);
    fetchCardEditionWeeks.mockResolvedValue([]);
    fetchEditionCards.mockResolvedValue([]);
    render(await ParallelsPreviewPage());
    expect(redirect).toHaveBeenCalledWith("/admin");
  });

  it("shows every parallel, Eclipse included", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    fetchEditionCards.mockResolvedValue([card("Doug", 92), card("Ana", 88)]);

    render(await ParallelsPreviewPage());
    const foils = new Set([...screen.getAllByTestId("card")].map((node) => node.dataset.foil));
    expect(foils).toEqual(new Set(["prisma", "aurora", "refractor", "ice", "eclipse"]));
  });

  it("states Eclipse's real odds, and no longer claims it cannot be pulled", async () => {
    // This page is where staff check the odds, so its copy has to track the
    // config. It used to say a pack could not produce an Eclipse — true when
    // written, a lie the day the drop rate landed. That is the failure this
    // test exists to catch, in whichever direction it happens next.
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    fetchEditionCards.mockResolvedValue([card("Doug", 92, true)]);

    render(await ParallelsPreviewPage());
    expect(screen.queryByText(/cannot be pulled/i)).toBeNull();
    expect(screen.getByText(/of Card-of-the-Week pulls/i)).toBeTruthy();
    expect(screen.getByText(/Card of the Week only/i)).toBeTruthy();
    expect(screen.getByText(/Preview only/i)).toBeTruthy();
  });

  it("shows Eclipse on a Card of the Week, because that is the only card it can fall on", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
    fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
    fetchCardEditionWeeks.mockResolvedValue(["2026-08-24"]);
    // The highest-rated card is NOT crowned here — showing Eclipse over it
    // would picture a card that can never wear one.
    fetchEditionCards.mockResolvedValue([card("Uncrowned", 99), card("Crowned", 70, true)]);

    render(await ParallelsPreviewPage());
    const eclipses = [...screen.getAllByTestId("card")].filter((node) => node.dataset.foil === "eclipse");
    expect(eclipses.map((node) => node.textContent)).toEqual(["Crowned"]);
    // ...while the ordinary parallels still show off the best art there is.
    const prismas = [...screen.getAllByTestId("card")].filter((node) => node.dataset.foil === "prisma");
    expect(prismas.map((node) => node.textContent)).toContain("Uncrowned");
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
