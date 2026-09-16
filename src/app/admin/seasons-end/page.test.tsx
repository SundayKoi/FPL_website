import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { staff, load, fetchCards, redirect } = vi.hoisted(() => ({
  staff: vi.fn(),
  load: vi.fn(),
  fetchCards: vi.fn(),
  redirect: vi.fn(() => { throw new Error("redirect"); }),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier: staff }));
vi.mock("@/lib/league/season", async (importOriginal) => ({ ...await importOriginal<object>(), fetchLeagueSeasons: async () => ({ premier: "S5", academy: "A1" }) }));
vi.mock("@/lib/season-end/queries", () => ({ loadSeasonEnd: load }));
vi.mock("@/lib/cards/queries", () => ({ fetchSeasonCards: fetchCards }));
vi.mock("@/components/admin/SeasonEndAwardCard", () => ({
  default: ({ award, cards }: { award: { title: string; winners: { value: number }[] }; cards: unknown[] }) => (
    <div data-testid="award-card" data-card-count={cards.length}>
      <h3>{award.title}</h3>
      {award.winners.map((winner) => <p key={winner.value}><span>{winner.value}</span> <span>kills</span></p>)}
    </div>
  ),
}));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: { name: string } }) => <div data-testid="season-card">{card.name}</div>,
}));
vi.mock("next/navigation", () => ({ redirect }));

import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  staff.mockResolvedValue({ isAdmin: true, isOwner: false });
  load.mockResolvedValue({
    games: 6,
    players: 10,
    minGames: 5,
    complete: false,
    warnings: [],
    awards: [{ id: "body-count", title: "Body Count", description: "Most kills", group: "Record breakers", mode: "total", unit: "kills", status: "ready", winners: [{ name: "Alice#NA1", team: "Wolves", games: 6, value: 60, total: 60, perGame: 10 }] }],
  });
  fetchCards.mockResolvedValue([{ slug: "alice", name: "Alice", tag: "NA1", teamName: "Wolves", level: 6, signature: { champion: "Ahri", games: 4 } }]);
});

describe("Season's End admin page", () => {
  it.each([{ isAdmin: false, isOwner: false }, { isAdmin: false, isOwner: false, isBroadcaster: true }])("gates stats reads behind admin/owner access", async (permissions) => {
    staff.mockResolvedValue(permissions);
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(load).not.toHaveBeenCalled();
  });

  it("passes all season cards to the first-design honors renderer and keeps cumulative cards separate", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("kills")).toBeTruthy();
    expect(screen.queryByText(/Season total/)).toBeNull();
    expect(screen.getByTestId("award-card").dataset.cardCount).toBe("1");
    expect(screen.getByRole("heading", { name: "Season Cards" })).toBeTruthy();
    expect(screen.getByTestId("season-card").textContent).toBe("Alice");
  });

  it("defaults to the selected league's season", async () => {
    render(await Page({ searchParams: Promise.resolve({ league: "academy" }) }));
    expect(load).toHaveBeenCalledWith({}, "academy", "A1");
    expect(fetchCards).toHaveBeenCalledWith({}, "A1");
  });

  it("never loads a season from the other league", async () => {
    render(await Page({ searchParams: Promise.resolve({ league: "academy", season: "S5" }) }));
    expect(load).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
