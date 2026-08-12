import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LeagueHub from "./LeagueHub";

vi.mock("@/lib/home/standings", () => ({
  fetchHomepageStandings: vi.fn(async () => [
    {
      id: "team-alpha",
      name: "Alpha",
      abbreviation: "AL",
      nomination_position: 1,
      wins: 0,
      losses: 0,
    },
  ]),
}));

vi.mock("@/lib/home/schedule", () => ({
  fetchHomepageSchedule: vi.fn(async () => ({
    season: "S5",
    isNewestSeason: true,
    activeStage: "week_1",
    fixtures: [],
  })),
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
});

describe("LeagueHub", () => {
  it("uses the wide dashboard spacing on desktop", async () => {
    render(await LeagueHub());

    const main = screen.getByRole("main");
    expect(main.firstElementChild).toHaveClass(
      "max-w-[1800px]",
      "px-4",
      "sm:px-6",
      "py-12",
      "sm:py-16",
    );
    expect(screen.getByRole("region", { name: /homepage dashboard/i })).toHaveClass(
      "lg:grid-cols-[2fr_1fr]",
      "xl:gap-8",
    );
  });

  it("keeps the homepage focused on league broadcasts", async () => {
    render(await LeagueHub());

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

  it("adds the Twitch broadcast showcase to the landing page", async () => {
    render(await LeagueHub());

    expect(
      screen.getByRole("article", { name: /franchise premier league broadcast/i }),
    ).not.toBeNull();
  });

  it("adds the weekly standouts panel to the landing page", async () => {
    render(await LeagueHub());

    expect(screen.getByRole("article", { name: /latest week's standouts/i })).not.toBeNull();
  });

  it("adds the team standings panel to the landing page", async () => {
    render(await LeagueHub());

    expect(screen.getByRole("article", { name: /team standings/i })).not.toBeNull();
    expect(screen.getByText("Alpha")).not.toBeNull();
  });

  it("places the schedule below the broadcast and standings in the right rail", async () => {
    render(await LeagueHub());

    const broadcast = screen.getByRole("article", {
      name: /franchise premier league broadcast/i,
    });
    const schedule = screen.getByRole("article", { name: /upcoming schedule/i });
    const standings = screen.getByRole("article", { name: /team standings/i });
    const standouts = screen.getByRole("article", { name: /latest week's standouts/i });

    expect(broadcast.parentElement).toBe(schedule.parentElement);
    expect(standings.parentElement).toBe(standouts.parentElement);
    expect(broadcast.parentElement).not.toBe(standings.parentElement);
    expect(
      broadcast.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      schedule.compareDocumentPosition(standings) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      standings.compareDocumentPosition(standouts) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("adds the upcoming schedule below the dashboard", async () => {
    render(await LeagueHub());

    expect(screen.getByRole("article", { name: /upcoming schedule/i })).not.toBeNull();
  });
});
