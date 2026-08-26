import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { FixtureRow } from "@/lib/schedule/types";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterWorkspace from "./BroadcasterWorkspace";

vi.mock("./BroadcasterFixtureHeader", () => ({
  default: ({
    fixture,
    onOpenHeadToHead,
  }: {
    fixture: FixtureRow;
    onOpenHeadToHead?: () => void;
  }) => <>
    <p>fixture header: {fixture.team_a} vs {fixture.team_b}</p>
    {onOpenHeadToHead ? <button type="button" onClick={onOpenHeadToHead}>Head-to-head</button> : null}
  </>,
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

  it("opens head-to-head from fixture header without changing workspace tab", () => {
    render(<BroadcasterWorkspace league="premier" fixture={fixture} settings={settings} teamA={source("Alpha")} teamB={source("Beta")} />);

    expect(screen.queryByRole("dialog", { name: /head-to-head/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /head-to-head/i }));
    expect(screen.getByRole("dialog", { name: /head-to-head/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /matchup overview/i })).toBeTruthy();
  });

  it("supports roving keyboard navigation and keeps every controlled panel mounted", () => {
    render(<BroadcasterWorkspace league="premier" fixture={fixture} settings={settings} teamA={source("Alpha")} teamB={source("Beta")} />);

    const alpha = screen.getByRole("tab", { name: /Alpha scouting/i });
    const matchups = screen.getByRole("tab", { name: /^Matchups$/ });
    const beta = screen.getByRole("tab", { name: /Beta scouting/i });
    expect(alpha.tabIndex).toBe(0);
    expect(matchups.tabIndex).toBe(-1);
    for (const tab of [alpha, matchups, beta]) {
      expect(document.getElementById(tab.getAttribute("aria-controls")!)).toBeTruthy();
    }

    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(document.activeElement).toBe(matchups);
    expect(matchups.getAttribute("aria-selected")).toBe("true");
    expect(matchups.tabIndex).toBe(0);

    fireEvent.keyDown(matchups, { key: "End" });
    expect(document.activeElement).toBe(beta);
    expect(beta.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(beta, { key: "Home" });
    expect(document.activeElement).toBe(alpha);
    expect(alpha.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(alpha, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(beta);
    expect(beta.getAttribute("aria-selected")).toBe("true");
  });
});
