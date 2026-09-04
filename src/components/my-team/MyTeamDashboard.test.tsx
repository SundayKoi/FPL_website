import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";
import { MyTeamDashboard } from "./MyTeamDashboard";

function dashboard(overrides: Partial<MyTeamReadyDashboard> = {}): MyTeamReadyDashboard {
  const fixture = {
    id: "fixture-1", season: "S5", stage: "week_1" as const, division: null,
    team_a: "My Team", team_b: "Enemy Team", scheduled_at: "2026-09-01T00:00:00Z", best_of: 3 as const,
    score_a: null, score_b: null, sort_order: 0, created_at: "2026-08-01T00:00:00Z",
  };
  const teams = [
    { id: "team-1", name: "My Team", abbreviation: "MY", active: true },
    { id: "team-2", name: "Enemy Team", abbreviation: "EN", active: true },
  ];
  return {
    kind: "ready", league: "premier", profileId: "profile-1", playerPoolId: "pool-1", season: "S5",
    team: { ...teams[0], imageUrl: null, bannerColor: "#123456" }, teams, activeTeams: teams,
    nextFixture: fixture, codes: [], draftGames: [], schedule: [fixture],
    roster: { draftPlayers: [], riotAccounts: [], multiOpggUrl: null },
    opponent: {
      team: teams[1], name: "Enemy Team", roster: { draftPlayers: [], riotAccounts: [] }, multiOpggUrl: null,
      scoutingUnavailable: false, statsUnavailable: false, stats: null,
    },
    results: { games: [], players: [] }, isCaptain: false, isAdmin: false, ...overrides,
  };
}

function follows(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

afterEach(cleanup);

describe("MyTeamDashboard", () => {
  it("keeps the approved first-look hierarchy in document order", () => {
    render(<MyTeamDashboard dashboard={dashboard()} league="premier" />);
    const header = screen.getByRole("heading", { name: "My Team" }).closest("header")!;
    const hero = screen.getByRole("region", { name: "Next match" });
    const opponent = screen.getByRole("region", { name: /opponent profile/i });
    const lineup = screen.getByRole("region", { name: "Match lineups" });
    const overview = screen.getByRole("region", { name: "Season overview" });
    const performance = screen.getByText("Team performance details").closest("details")!;
    const codes = screen.getByRole("region", { name: "Tournament codes" });

    expect([header, hero, opponent, lineup, overview, performance, codes].every((item, index, items) => index === 0 || follows(items[index - 1], item))).toBe(true);
  });

  it("keeps the ordinary member view read-only and exposes real destinations", () => {
    const fixture = dashboard().nextFixture!;
    const stats = {
      team_name: "Enemy Team", season: "S5", season_phase: "Regular", games: 3, wins: 2, losses: 1,
      winrate_pct: 66.7, avg_duration_min: 28, dragon_rate: 50, baron_rate: 50, first_blood_rate: 50,
      first_tower_rate: 50, avg_team_kills: 11,
    };
    render(<MyTeamDashboard dashboard={dashboard({ codes: [{ id: "code", fixture_id: fixture.id, season: "S5", team_a_id: "team-1", team_b_id: "team-2", game_number: 1, code: "CODE-1", note: null, created_by: null, created_at: "2026-08-01T00:00:00Z" }], opponent: { ...dashboard().opponent!, stats, statsUnavailable: false } })} league="premier" />);

    expect(screen.getByRole("link", { name: /open spectator view/i })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /open captain view/i })).toBeNull();
    expect(screen.getByRole("link", { name: /open full team stats/i }).getAttribute("href")).toBe("/stats?tab=Teams&team=Enemy+Team&season=S5");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByText(/ready for friday|readiness|\d\/\d ready/i)).toBeNull();
  });
});
