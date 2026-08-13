import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PreseasonHomePage from "./PreseasonHomePage";

vi.mock("@/lib/home/preseason", () => ({
  fetchPreseasonHomeData: vi.fn(async () => ({
    draftId: "draft-s5",
    draftName: "Season 5 Draft",
    teams: [
      {
        id: "team-a",
        name: "Alpha",
        abbreviation: "ALP",
        division: "Lunari",
        imageUrl: null,
        bannerColor: "#123456",
        nominationPosition: 1,
        pointsRemaining: 74,
        budgetStart: 100,
        rosterCount: 2,
        draftedPlayers: [
          { id: "player-2", displayName: "Captain Player", role: "jungle", rank: "D3", price: 0, acquisition: "captain" },
        ],
        captainName: "Captain Alpha",
      },
    ],
    players: [
      { id: "player-1", displayName: "Open Player", role: "top", rank: "D2", opggUrl: "https://op.gg/open", price: null, available: true, lockLabel: null },
      { id: "player-2", displayName: "Captain Player", role: "jungle", rank: "D3", opggUrl: "https://op.gg/captain", price: 0, available: false, lockLabel: "Captain" },
    ],
  })),
}));

afterEach(() => cleanup());

describe("PreseasonHomePage", () => {
  it("presents the draft briefing, budget preview, and available player pool", async () => {
    render(await PreseasonHomePage());

    expect(screen.getByRole("heading", { name: /draft room is almost open/i })).not.toBeNull();
    expect(screen.getAllByText("Saturday, August 15 · 8:00 PM EST").length).toBeGreaterThan(0);
    expect(screen.getByText("Monday, August 17")).not.toBeNull();
    expect(screen.getByText("74 pts left")).not.toBeNull();
    expect(screen.getByText("Open Player")).not.toBeNull();
    expect(screen.getAllByText("Captain Player").length).toBeGreaterThan(0);
    expect(screen.getByText("DRAFTED PLAYERS")).not.toBeNull();
    expect(screen.getByText("Captain Captain Alpha")).not.toBeNull();
    expect(screen.getAllByText(/captain/i).length).toBeGreaterThan(0);
  });
});
