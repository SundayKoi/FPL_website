import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import UpcomingSchedule from "./UpcomingSchedule";
import type { HomepageScheduleData } from "@/lib/home/schedule";
import type { FixtureRow } from "@/lib/schedule/types";

function fixture(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "fixture-1",
    season: "S5",
    stage: "week_1",
    division: "Solari",
    team_a: "Alpha",
    team_b: "Bravo",
    scheduled_at: "2026-08-17T00:00:00Z",
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

function schedule(overrides: Partial<HomepageScheduleData> = {}): HomepageScheduleData {
  return {
    season: "S5",
    isNewestSeason: true,
    activeStage: "week_1",
    fixtures: [fixture()],
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("UpcomingSchedule", () => {
  it("renders the active week fixtures and links to that Schedule section", () => {
    render(<UpcomingSchedule schedule={schedule()} />);

    expect(screen.getByRole("article", { name: /upcoming schedule/i })).toBeTruthy();
    expect(screen.getByText("Week 1")).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByRole("link", { name: /view full schedule/i }).getAttribute("href")).toBe(
      "/schedule#week_1",
    );
  });

  it("renders a coming-soon state for an empty active week", () => {
    render(<UpcomingSchedule schedule={schedule({ fixtures: [] })} />);

    expect(screen.getByText(/schedule coming soon/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /view full schedule/i }).getAttribute("href")).toBe(
      "/schedule#week_1",
    );
  });

  it("includes an older season in the Schedule link", () => {
    render(<UpcomingSchedule schedule={schedule({ isNewestSeason: false, season: "S4" })} />);

    expect(screen.getByRole("link", { name: /view full schedule/i }).getAttribute("href")).toBe(
      "/schedule?season=S4#week_1",
    );
  });

  it("renders the regular-season-complete state", () => {
    render(<UpcomingSchedule schedule={schedule({ activeStage: null, fixtures: [] })} />);

    expect(screen.getByText(/regular season complete/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /view full schedule/i })).toBeNull();
  });
});
