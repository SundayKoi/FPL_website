import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import { MyTeamMatchHero } from "./MyTeamMatchHero";

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: "Solari",
  team_a: "Meridian",
  team_b: "Academy One",
  scheduled_at: "2026-09-07T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2026-08-01T00:00:00Z",
};

describe("MyTeamMatchHero", () => {
  afterEach(cleanup);

  it("gives ordinary members only the spectator draft link", () => {
    render(<MyTeamMatchHero fixture={fixture} myTeamName="Meridian" canOpenCaptainDraft={false} />);

    expect(screen.getByRole("link", { name: /open spectator draft link/i }).getAttribute("href")).toBe("/match-draft/fixture-1?layout=stage");
    expect(screen.queryByRole("link", { name: /captain/i })).toBeNull();
  });

  it("gives captains both role-appropriate draft links", () => {
    render(<MyTeamMatchHero fixture={fixture} myTeamName="Meridian" canOpenCaptainDraft />);

    expect(screen.getByRole("link", { name: /open captain draft link/i }).getAttribute("href")).toBe("/match-draft/fixture-1?layout=board");
    expect(screen.getByRole("link", { name: /open spectator draft link/i }).getAttribute("href")).toBe("/match-draft/fixture-1?layout=stage");
  });

  it("shows a scheduled-empty state without draft links", () => {
    render(<MyTeamMatchHero fixture={null} myTeamName="Meridian" canOpenCaptainDraft />);

    expect(screen.getByText(/no upcoming match scheduled/i)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/ready for friday|readiness|\d\/\d ready/i)).toBeNull();
  });
});
