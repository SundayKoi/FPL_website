import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegularSeasonHomePage from "./RegularSeasonHomePage";

const {
  fetchHomepageAwards,
  fetchHomepageSchedule,
  fetchHomepageStandings,
  fetchHomepageTwitch,
  fetchHomepageFeaturedSettings,
  fetchTeamIdentities,
} = vi.hoisted(() => ({
  fetchHomepageAwards: vi.fn(),
  fetchHomepageSchedule: vi.fn(),
  fetchHomepageStandings: vi.fn(),
  fetchHomepageTwitch: vi.fn(),
  fetchHomepageFeaturedSettings: vi.fn(),
  fetchTeamIdentities: vi.fn(),
}));

function resetMocks() {
  fetchHomepageTwitch.mockResolvedValue({
    status: { state: "offline", title: null, viewerCount: null, startedAt: null },
    clips: [],
  });
  fetchHomepageStandings.mockResolvedValue({
    teams: [
      {
        id: "team-alpha",
        name: "Alpha",
        abbreviation: "AL",
        nomination_position: 1,
        wins: 0,
        losses: 0,
      },
    ],
    race: [],
  });
  fetchHomepageSchedule.mockResolvedValue({
    season: "S5",
    isNewestSeason: true,
    activeStage: "week_1",
    fixtures: [],
  });
  fetchTeamIdentities.mockResolvedValue({});
  fetchHomepageAwards.mockResolvedValue({
    season: "S5",
    periodLabel: "Week of Apr 27",
    playerOfWeek: {
      title: "Player of the Week",
      name: "Ace",
      tag: "FPL",
      teamName: "Alpha",
      detail: "Alpha · MIDDLE · 2 games",
      value: "91",
    },
    teamOfWeek: {
      title: "Team of the Week",
      name: null,
      tag: null,
      teamName: "Alpha",
      detail: "100% weekly win rate",
      value: "2–0",
    },
    individualAwards: [],
    teamAwards: [],
  });
  fetchHomepageFeaturedSettings.mockResolvedValue({
    fixtureId: null,
    title: null,
    description: null,
    twitchUrl: null,
  });
}

vi.mock("@/lib/home/twitch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/twitch")>()),
  fetchHomepageTwitch,
}));

vi.mock("@/lib/home/standings", () => ({
  fetchHomepageStandings,
}));

vi.mock("@/lib/home/homepageSettings", () => ({
  fetchHomepageFeaturedSettings,
}));

vi.mock("@/lib/home/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/schedule")>()),
  fetchHomepageSchedule,
}));

// Crest lookup is a server-side query; without a request scope it throws.
vi.mock("@/lib/teams/identity", () => ({
  fetchTeamIdentities,
}));

vi.mock("@/lib/home/awards", () => ({
  fetchHomepageAwards,
  PREMIER_SEASON: "S5",
}));



expect.extend({
  toHaveClass(received: Element | null | undefined, ...classNames: string[]) {
    const missing = classNames.filter((className) => !received?.classList.contains(className));

    return {
      pass: missing.length === 0,
      message: () =>
        `expected element class="${received?.getAttribute("class") ?? ""}" to include ${classNames.join(", ")}`,
    };
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RegularSeasonHomePage", () => {
  beforeEach(resetMocks);

  it("uses the tightened dashboard spacing on desktop", async () => {
    render(await RegularSeasonHomePage());

    const main = screen.getByRole("main");
    expect(main.firstElementChild).toHaveClass(
      "max-w-[1800px]",
      "px-4",
      "sm:px-6",
      "py-8",
      "sm:py-10",
    );
    expect(screen.getByRole("region", { name: /homepage dashboard/i })).toHaveClass("space-y-6");
  });

  it("keeps the homepage focused on league broadcasts", async () => {
    render(await RegularSeasonHomePage());

    const twitchLinks = screen.getAllByRole("link", { name: /twitch/i });
    expect(twitchLinks.length).toBeGreaterThanOrEqual(1);

    for (const twitchLink of twitchLinks) {
      expect(twitchLink.getAttribute("href")).toBe(
        "https://www.twitch.tv/franchisepremierleague",
      );
      expect(twitchLink.getAttribute("target")).toBe("_blank");
      expect(twitchLink.getAttribute("rel")).toBe("noreferrer");
    }

    expect(screen.queryByRole("heading", { name: /explore the league/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /draft central/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /explore drafts/i })).toBeNull();
  });

  it("uses the saved Twitch channel for status loading and homepage links", async () => {
    fetchHomepageFeaturedSettings.mockResolvedValue({
      fixtureId: null,
      title: null,
      description: null,
      twitchUrl: "https://www.twitch.tv/jakeok1",
    });

    render(await RegularSeasonHomePage());

    expect(fetchHomepageTwitch).toHaveBeenCalledWith("jakeok1");
    for (const twitchLink of screen.getAllByRole("link", { name: /twitch/i })) {
      expect(twitchLink.getAttribute("href")).toBe("https://www.twitch.tv/jakeok1");
    }
  });

  it("adds the Twitch broadcast showcase to the landing page", async () => {
    render(await RegularSeasonHomePage());

    expect(
      screen.getByRole("article", { name: /franchise premier league broadcast/i }),
    ).not.toBeNull();
  });

  it("adds the awards desk to the landing page", async () => {
    render(await RegularSeasonHomePage());

    expect(screen.getByRole("region", { name: /awards desk/i })).not.toBeNull();
  });

  it("adds the team standings panel to the landing page", async () => {
    render(await RegularSeasonHomePage());

    expect(screen.getByRole("article", { name: /team standings/i })).not.toBeNull();
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
  });

  it("places the awards desk below standings and above the schedule", async () => {
    render(await RegularSeasonHomePage());

    const broadcast = screen.getByRole("article", {
      name: /franchise premier league broadcast/i,
    });
    const schedule = screen.getByRole("article", { name: /upcoming schedule/i });
    const standings = screen.getByRole("article", { name: /team standings/i });
    const awards = screen.getByRole("region", { name: /awards desk/i });

    expect(
      broadcast.compareDocumentPosition(standings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      standings.compareDocumentPosition(awards) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      awards.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Top Cards renders nothing when the week has no cards, which is this
    // fixture's state — the awards/schedule ordering is what this asserts.
  });

  it("adds the upcoming schedule below the dashboard", async () => {
    render(await RegularSeasonHomePage());

    expect(screen.getByRole("article", { name: /upcoming schedule/i })).not.toBeNull();
  });

  it("renders the dashboard fallback when Supabase-backed homepage data is offline", async () => {
    fetchHomepageStandings.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:54321"));
    fetchHomepageSchedule.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:54321"));
    fetchTeamIdentities.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:54321"));

    render(await RegularSeasonHomePage());

    expect(screen.getByRole("region", { name: /homepage dashboard/i })).not.toBeNull();
    expect(screen.getByRole("article", { name: /upcoming schedule/i })).not.toBeNull();
    expect(within(screen.getByRole("article", { name: /team standings/i })).queryByText("Alpha")).toBeNull();
  });
});
