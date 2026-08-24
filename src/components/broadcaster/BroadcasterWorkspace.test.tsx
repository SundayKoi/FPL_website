import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { FixtureRow } from "@/lib/schedule/types";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterWorkspace from "./BroadcasterWorkspace";

vi.mock("./BroadcasterFixtureHeader", () => ({
  default: ({ fixture }: { fixture: FixtureRow }) => <p>fixture header: {fixture.team_a} vs {fixture.team_b}</p>,
}));

vi.mock("./BroadcasterMatchups", () => ({
  default: ({ teamA, teamB }: { teamA: ScoutSource; teamB: ScoutSource }) => <p>matchups: {teamA.teamName} vs {teamB.teamName}</p>,
}));

vi.mock("@/components/captain/OpponentScout", () => ({
  default: ({ source, perspective }: { source: ScoutSource; perspective?: string }) => <p>{perspective} scout: {source.teamName}</p>,
}));

afterEach(cleanup);

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: null,
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: "2026-08-24T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-19T00:00:00Z",
};

const source = (teamName: string): ScoutSource => ({
  opponentName: teamName,
  teamName,
  currentSeason: "S5",
  nextFixture: fixture,
  roster: [],
  fixtures: [],
  drafts: [],
});

const settings: HomepageFeaturedSettings = {
  fixtureId: fixture.id,
  title: null,
  description: null,
  twitchUrl: "https://twitch.tv/fpl",
};

describe("BroadcasterWorkspace", () => {
  it("switches between team scouting and matchup tabs", () => {
    render(<BroadcasterWorkspace league="premier" fixture={fixture} settings={settings} teamA={source("Alpha")} teamB={source("Beta")} />);

    expect(screen.getByRole("tab", { name: /Alpha scouting/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("team scout: Alpha")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /^Matchups$/ }));
    expect(screen.getByText("matchups: Alpha vs Beta")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Beta scouting/i }));
    expect(screen.getByText("team scout: Beta")).toBeTruthy();
  });

  it("links to both league workspaces and marks the selected league", () => {
    render(<BroadcasterWorkspace league="premier" fixture={fixture} settings={settings} teamA={source("Alpha")} teamB={source("Beta")} />);

    const premier = screen.getByRole("link", { name: /^Premier$/ });
    const academy = screen.getByRole("link", { name: /^Academy$/ });
    expect(premier.getAttribute("href")).toBe("/broadcaster?league=premier");
    expect(academy.getAttribute("href")).toBe("/broadcaster?league=academy");
    expect(premier.getAttribute("aria-current")).toBe("page");
    expect(academy.getAttribute("aria-current")).toBeNull();
  });
});
