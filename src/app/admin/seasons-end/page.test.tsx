import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { staff, load, loadTeamIdentities, fetchCards, redirect, readViewerDiscordId, fetchPatronActive } = vi.hoisted(() => ({
  staff: vi.fn(),
  load: vi.fn(),
  loadTeamIdentities: vi.fn(),
  fetchCards: vi.fn(),
  redirect: vi.fn(() => { throw new Error("redirect"); }),
  readViewerDiscordId: vi.fn(),
  fetchPatronActive: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier: staff }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient: vi.fn(() => ({})) }));
vi.mock("@/lib/cards/viewer", () => ({ readViewerDiscordId }));
vi.mock("@/lib/patron/queries", () => ({ fetchPatronActive }));
vi.mock("@/lib/season-end/queries", () => ({ loadSeasonEnd: load, loadSeasonEndTeamIdentities: loadTeamIdentities }));
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
  default: ({ card, edition }: { card: { name: string }; edition?: string }) => <div data-testid="season-card" data-edition={edition ?? "weekly"}>{card.name}</div>,
}));
vi.mock("next/navigation", () => ({ redirect }));

import Page from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  staff.mockResolvedValue({ isAdmin: true, isOwner: false });
  readViewerDiscordId.mockResolvedValue("patron-discord-id");
  fetchPatronActive.mockResolvedValue(false);
  loadTeamIdentities.mockResolvedValue({});
  load.mockResolvedValue({
    games: 6,
    players: 10,
    minGames: 5,
    complete: false,
    warnings: [],
    awards: [{ id: "body-count", title: "Body Count", description: "Most kills", group: "Record breakers", scope: "player", partition: "division", mode: "total", unit: "kills", status: "ready", winners: [{ name: "Alice#NA1", team: "Wolves", games: 6, value: 60, total: 60, perGame: 10 }] }],
  });
  fetchCards.mockResolvedValue([{ slug: "alice", name: "Alice", tag: "NA1", teamName: "Wolves", level: 6, signature: { champion: "Ahri", games: 4 } }]);
});

describe("Season's End admin page", () => {
  it.each([{ isAdmin: false, isOwner: false }, { isAdmin: false, isOwner: false, isBroadcaster: true }])("gates stats reads behind admin/owner access", async (permissions) => {
    staff.mockResolvedValue(permissions);
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(load).not.toHaveBeenCalled();
  });

  it("lets an active patron see the cards without admin sections", async () => {
    staff.mockResolvedValue({ isAdmin: false, isOwner: false });
    fetchPatronActive.mockResolvedValue(true);

    render(await Page({ searchParams: Promise.resolve({}) }));

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "← Cards" }).getAttribute("href")).toBe("/cards");
    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Season coverage" })).toBeNull();
    expect(screen.queryByText("Admin preview · read-only")).toBeNull();
    expect(screen.queryByRole("link", { name: "Developer crop audit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Calculate cards" })).toBeNull();
  });

  it("passes all season cards to the first-design honors renderer and keeps cumulative cards separate", async () => {
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Body Count" })).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("kills")).toBeTruthy();
    expect(screen.queryByText(/Season total/)).toBeNull();
    expect(screen.getByTestId("award-card").dataset.cardCount).toBe("1");
    expect(screen.getByRole("heading", { name: "Cards of the Season" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Best of Champions" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Best of Champions" })).toBeTruthy();
    expect(screen.getByText("07")).toBeTruthy();
    expect(screen.getByTestId("season-card").textContent).toBe("Alice");
    expect(screen.getByTestId("season-card").dataset.edition).toBe("season");
  });

  it("uses the fixed season for the selected league", async () => {
    render(await Page({ searchParams: Promise.resolve({ league: "academy" }) }));
    expect(load).toHaveBeenCalledWith({}, "academy", "A1");
    expect(fetchCards).toHaveBeenCalledWith({}, "A1");
    expect(loadTeamIdentities).toHaveBeenCalledWith({}, "academy", "A1");
    expect((screen.getByRole("combobox", { name: "League" }) as HTMLSelectElement).value).toBe("academy");
  });

  it("ignores a supplied season and keeps Premier pinned to S5", async () => {
    render(await Page({ searchParams: Promise.resolve({ league: "premier", season: "S4" }) }));
    expect(load).toHaveBeenCalledWith({}, "premier", "S5");
    expect(fetchCards).toHaveBeenCalledWith({}, "S5");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Season" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Calculate cards" })).toBeNull();
  });

  it("renders Best of Champions as its own category after Season stories", async () => {
    load.mockResolvedValueOnce({
      games: 6,
      players: 10,
      minGames: 5,
      complete: true,
      warnings: [],
      awards: [
        { id: "late-bloomer", title: "Late Bloomer", description: "Late", group: "Season stories", scope: "player", partition: "division", status: "unearned", winners: [] },
        { id: "best-of-champion", title: "Best of Champion", description: "Assignment", group: "Best of Champions", scope: "player", partition: "league", status: "ready", winners: [{ name: "Alice#NA1", team: "Wolves", games: 6, value: 85 }] },
      ],
    });
    render(await Page({ searchParams: Promise.resolve({}) }));

    const stories = screen.getByRole("region", { name: "Season stories" });
    const bestOf = screen.getByRole("region", { name: "Best of Champions" });
    expect(stories.querySelector("h2")?.textContent).toBe("Season stories");
    expect(stories.querySelector("h3")?.textContent).not.toBe("Best of Champion");
    expect(bestOf.querySelector("h2")?.textContent).toBe("Best of Champions");
    expect(bestOf.querySelector("h3")?.textContent).toBe("Best of Champion");
    expect(bestOf.querySelector('[data-testid="award-card"]')?.textContent).toContain("85");
  });
});
