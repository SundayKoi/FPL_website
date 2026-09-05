import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MyTeamOpponent } from "@/lib/my-team/types";
import type { TeamAggRow } from "@/lib/stats/types";
import { OpponentTeamStatsCard } from "./OpponentTeamStatsCard";

const stats: TeamAggRow = {
  team_name: "Academy Two", season: "A1", season_phase: "A1", games: 8, wins: 5, losses: 3,
  winrate_pct: 62.5, avg_duration_min: 27.5, dragon_rate: 50, baron_rate: 25,
  first_blood_rate: 75, first_tower_rate: 50, avg_team_kills: 12,
};

function opponent(overrides: Partial<MyTeamOpponent> = {}): MyTeamOpponent {
  return {
    team: { id: "team-2", name: "Academy Two", abbreviation: "A2", active: true },
    name: "Academy Two",
    roster: null,
    multiOpggUrl: null,
    scoutingUnavailable: false,
    stats,
    statsUnavailable: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe("OpponentTeamStatsCard", () => {
  it("links to the exact team stats scope and the canonical scouting route", () => {
    render(<OpponentTeamStatsCard opponent={opponent()} season="A1" league="academy" draftScoutingHref="/academy/my-team/scouting?team=team-2" />);

    expect(screen.getByRole("link", { name: /open full team stats/i }).getAttribute("href"))
      .toBe("/academy/stats?tab=Teams&team=Academy+Two&season=A1");
    expect(screen.getByRole("link", { name: /view draft patterns/i }).getAttribute("href"))
      .toBe("/academy/my-team/scouting?team=team-2");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("shows the real aggregate profile without prototype claims", () => {
    render(<OpponentTeamStatsCard opponent={opponent()} season="A1" league="academy" draftScoutingHref="/academy/my-team/scouting" />);

    expect(screen.getByRole("heading", { name: "Scout Academy Two" })).toBeTruthy();
    expect(screen.getByText("5W · 3L")).toBeTruthy();
    expect(screen.getByText(/12\.0 kills\/game/i)).toBeTruthy();
    expect(screen.getByText(/27\.5 min average/i)).toBeTruthy();
    expect(screen.queryByText(/updated today|new games|tendency|champion pool/i)).toBeNull();
  });

  it("keeps both destinations available for missing and unavailable stats", () => {
    const { rerender } = render(<OpponentTeamStatsCard opponent={opponent({ stats: null })} season="A1" league="academy" draftScoutingHref="/academy/my-team/scouting" />);
    expect(screen.getByText(/no team stats for this season yet/i)).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);

    rerender(<OpponentTeamStatsCard opponent={opponent({ stats: null, statsUnavailable: true })} season="A1" league="academy" draftScoutingHref="/academy/my-team/scouting" />);
    expect(screen.getByText(/team stats temporarily unavailable/i)).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
