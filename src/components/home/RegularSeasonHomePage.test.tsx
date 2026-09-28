import { cleanup, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegularSeasonHomePage from "./RegularSeasonHomePage";

const {
  fetchCardSeason,
  fetchCurrentWeekCards,
  fetchHomepageAwards,
  fetchHomepageSchedule,
  fetchHomepageStandings,
  fetchHomepageTwitch,
  fetchHomepageFeaturedSettings,
  fetchTeamIdentities,
  homeViewer,
} = vi.hoisted(() => ({
  fetchCardSeason: vi.fn(),
  fetchCurrentWeekCards: vi.fn(),
  fetchHomepageAwards: vi.fn(),
  fetchHomepageSchedule: vi.fn(),
  fetchHomepageStandings: vi.fn(),
  fetchHomepageTwitch: vi.fn(),
  fetchHomepageFeaturedSettings: vi.fn(),
  fetchTeamIdentities: vi.fn(),
  homeViewer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason, fetchCurrentWeekCards }));
vi.mock("@/lib/home/twitch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/twitch")>()),
  fetchHomepageTwitch,
}));
vi.mock("@/lib/home/standings", () => ({ fetchHomepageStandings }));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/home/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/schedule")>()),
  fetchHomepageSchedule,
}));
vi.mock("@/lib/teams/identity", () => ({ fetchTeamIdentities }));
vi.mock("@/lib/home/awards", () => ({ fetchHomepageAwards, PREMIER_SEASON: "S5" }));
vi.mock("@/lib/home/viewer", () => ({ homeViewer }));

const fixture = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1" as const,
  division: "Solari",
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: "2026-10-01T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  fetchCardSeason.mockResolvedValue("S5");
  fetchCurrentWeekCards.mockResolvedValue([]);
  homeViewer.mockResolvedValue("signed-out");
  fetchHomepageTwitch.mockResolvedValue({ status: { state: "offline" }, clips: [] });
  fetchHomepageStandings.mockResolvedValue({ teams: [], race: [], playoffSeeds: { Solari: [], Lunari: [] } });
  fetchHomepageSchedule.mockResolvedValue({
    season: "S5", isNewestSeason: true, activeStage: "week_1",
    fixtures: [fixture], upcoming: [fixture], seasonFixtures: [fixture],
    asOf: Date.parse("2026-09-01T00:00:00Z"),
  });
  fetchTeamIdentities.mockResolvedValue({});
  fetchHomepageAwards.mockResolvedValue({
    season: "S5", periodLabel: "S5", periodKey: null,
    playerOfWeek: { title: "Player of the Week", name: null, tag: null, teamName: null, detail: "—", value: "—" },
    teamOfWeek: { title: "Team of the Week", name: null, tag: null, teamName: null, detail: "—", value: "—" },
    individualAwards: [], teamAwards: [],
  });
  fetchHomepageFeaturedSettings.mockResolvedValue({ fixtureId: "fixture-1", title: "Premier spotlight", description: "Premier supporting copy", twitchUrl: "https://www.twitch.tv/jakeok1" });
});

describe("RegularSeasonHomePage", () => {
  it("uses one saved Premier season for the homepage loaders and the configured broadcast", async () => {
    render(await RegularSeasonHomePage());

    expect(fetchHomepageAwards).toHaveBeenCalledWith("S5");
    expect(fetchHomepageStandings).toHaveBeenCalledWith("S5");
    expect(fetchHomepageSchedule).toHaveBeenCalledWith(expect.any(Function), "S5");
    expect(fetchHomepageTwitch).toHaveBeenCalledWith("jakeok1");
    expect(screen.getByRole("heading", { level: 1, name: "Premier spotlight" })).toBeTruthy();
    expect(screen.getByText("Premier supporting copy")).toBeTruthy();
    expect(screen.getByRole("link", { name: /open twitch channel/i }).getAttribute("href")).toBe("https://www.twitch.tv/jakeok1");
    expect(screen.getByRole("link", { name: /view schedule/i }).getAttribute("href")).toBe("/schedule");
  });

  it("keeps the homepage available when its data loaders fail", async () => {
    fetchHomepageStandings.mockRejectedValue(new Error("offline"));
    fetchHomepageSchedule.mockRejectedValue(new Error("offline"));
    fetchTeamIdentities.mockRejectedValue(new Error("offline"));

    render(await RegularSeasonHomePage());

    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Premier spotlight" })).toBeTruthy();
    expect(screen.getByText("No upcoming fixtures are listed.")).toBeTruthy();
  });

  it("gives signed-in members four shortcuts under the hero, and visitors none", async () => {
    render(await RegularSeasonHomePage());
    expect(screen.queryByTestId("home-shortcuts")).toBeNull();

    cleanup();
    homeViewer.mockResolvedValue("member");
    render(await RegularSeasonHomePage());
    const member = within(screen.getByRole("navigation", { name: "Your shortcuts" }));
    expect(member.getAllByRole("link")).toHaveLength(4);
    expect(member.getByRole("link", { name: /get/i }).getAttribute("href")).toBe("/membership");
    expect(member.queryByRole("link", { name: /today's pack/i })).toBeNull();

    cleanup();
    homeViewer.mockResolvedValue("premium");
    render(await RegularSeasonHomePage());
    const premium = within(screen.getByRole("navigation", { name: "Your shortcuts" }));
    expect(premium.getByRole("link", { name: /open today's pack/i }).getAttribute("href")).toBe("/cards/packs");
    expect(premium.getByRole("link", { name: /my team/i }).getAttribute("href")).toBe("/my-team");
  });
});
