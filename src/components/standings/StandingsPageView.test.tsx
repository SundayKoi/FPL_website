import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchHomepageStandings, fetchAcademyDraftData, fetchLeagueSeasons } = vi.hoisted(() => ({
  fetchHomepageStandings: vi.fn(),
  fetchAcademyDraftData: vi.fn(),
  fetchLeagueSeasons: vi.fn(),
}));

vi.mock("@/lib/home/standings", () => ({ fetchHomepageStandings }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/league/season", () => ({ fetchLeagueSeasons }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));

import StandingsPageView from "./StandingsPageView";

const team = {
  id: "team-alpha",
  name: "Alpha",
  abbreviation: "AL",
  nomination_position: 1,
  wins: 3,
  losses: 1,
};

beforeEach(() => {
  fetchLeagueSeasons.mockResolvedValue({ premier: "S5", academy: "A1" });
  fetchAcademyDraftData.mockResolvedValue({ teams: [{ name: "Alpha" }] });
  fetchHomepageStandings.mockResolvedValue({ teams: [team], race: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StandingsPageView", () => {
  it("renders the table under a real heading with the league's season", async () => {
    render(await StandingsPageView({ league: "premier" }));

    expect(screen.getByRole("heading", { name: "Standings", level: 1 })).toBeTruthy();
    expect(screen.getByText("Franchise Premier League")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("S5");
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Schedule" }).getAttribute("href")).toBe("/schedule");
    expect(fetchHomepageStandings).toHaveBeenCalledWith("S5", undefined, "featured_draft_id", "divisions", true);
  });

  it("reads the academy's own draft and season", async () => {
    render(await StandingsPageView({ league: "academy" }));

    expect(screen.getByText("FPL Academy")).toBeTruthy();
    expect(screen.getByRole("main").textContent).toContain("A1");
    expect(fetchHomepageStandings).toHaveBeenCalledWith("A1", ["Alpha"], "academy_draft_id", "divisions", true);
    expect(screen.getByRole("link", { name: "Schedule" }).getAttribute("href")).toBe("/academy/schedule");
  });

  it("says so when no games have been played, and points at the schedule", async () => {
    fetchHomepageStandings.mockResolvedValue({ teams: [], race: [] });
    render(await StandingsPageView({ league: "premier" }));

    expect(screen.getByRole("region", { name: "No standings for S5 yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open schedule" }).getAttribute("href")).toBe("/schedule");
  });
});
