import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";

const {
  serverClient,
  loadMyTeamDashboard,
  fetchScoutingHistory,
  fetchInhousePlayerStats,
  opponentScout,
} = vi.hoisted(() => ({
  serverClient: { from: vi.fn() },
  loadMyTeamDashboard: vi.fn(),
  fetchScoutingHistory: vi.fn(),
  fetchInhousePlayerStats: vi.fn(),
  opponentScout: vi.fn((props: { source: { opponentName: string } }) => (
    <section>Scouting dashboard: {props.source.opponentName}</section>
  )),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => serverClient),
}));
vi.mock("@/lib/my-team/queries", () => ({ loadMyTeamDashboard }));
vi.mock("@/lib/scouting/queries", () => ({ fetchScoutingHistory, fetchInhousePlayerStats }));
vi.mock("@/components/captain/OpponentScout", () => ({
  default: (props: { source: { opponentName: string } }) => opponentScout(props),
}));
import { MyTeamScoutingPageView } from "./view";

const fixture = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1" as const,
  division: null,
  team_a: "My Team",
  team_b: "Enemy Team",
  scheduled_at: "2026-09-01T00:00:00Z",
  best_of: 3 as const,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00Z",
};

function ready(overrides: Partial<MyTeamReadyDashboard> = {}): MyTeamReadyDashboard {
  const teams = [
    { id: "team-1", name: "My Team", abbreviation: "MY", active: true },
    { id: "team-2", name: "Enemy Team", abbreviation: "EN", active: true },
  ];
  return {
    kind: "ready",
    league: "premier",
    profileId: "profile-1",
    playerPoolId: "pool-1",
    season: "S5",
    team: teams[0],
    teams,
    activeTeams: teams,
    nextFixture: fixture,
    codes: [],
    draftGames: [],
    schedule: [fixture],
    roster: { draftPlayers: [], riotAccounts: [], multiOpggUrl: null },
    opponent: {
      team: teams[1],
      name: "Enemy Team",
      roster: {
        draftPlayers: [{
          id: "opponent-player",
          draft_id: "draft-1",
          display_name: "Enemy Mid",
          role: "mid",
          rank: null,
          opgg_url: null,
          notes: null,
          canonical_player_id: "enemy-pool",
          team_id: "draft-team-2",
          price: 10,
          acquisition: "auction",
        }],
        riotAccounts: [],
      },
      multiOpggUrl: null,
      scoutingUnavailable: false,
    },
    results: { games: [], players: [] },
    isCaptain: false,
    isAdmin: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("My Team scouting page", () => {
  it("uses the server-resolved ordinary player's opponent and league-scoped history", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready());
    fetchScoutingHistory.mockResolvedValue({ fixtures: [fixture], drafts: [] });
    fetchInhousePlayerStats.mockResolvedValue([]);

    render(await MyTeamScoutingPageView({
      league: "premier",
      searchParams: Promise.resolve({ team: "browser-forged-team" }),
    }));

    expect(loadMyTeamDashboard).toHaveBeenCalledWith(serverClient, "premier", "browser-forged-team");
    expect(fetchScoutingHistory).toHaveBeenCalledWith(serverClient, {
      league: "premier",
      leagueTeamNames: ["My Team", "Enemy Team"],
    });
    expect(screen.getByText("Scouting dashboard: Enemy Team")).toBeTruthy();
    expect(screen.queryByLabelText(/viewing team/i)).toBeNull();
  });

  it("keeps an admin's validated team on the canonical scouting switcher", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready({ isAdmin: true }));
    fetchScoutingHistory.mockResolvedValue({ fixtures: [fixture], drafts: [] });
    fetchInhousePlayerStats.mockResolvedValue([]);

    const { container } = render(await MyTeamScoutingPageView({
      league: "academy",
      searchParams: Promise.resolve({ team: "team-1" }),
    }));

    expect(loadMyTeamDashboard).toHaveBeenCalledWith(serverClient, "academy", "team-1");
    expect(container.querySelector("form[method='get']")?.getAttribute("action"))
      .toBe("/academy/my-team/scouting");
  });

  it("keeps the page available when scouting enrichment fails", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready());
    fetchScoutingHistory.mockRejectedValue(new Error("unavailable"));

    render(await MyTeamScoutingPageView({ league: "premier", searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Scouting data is temporarily unavailable.")).toBeTruthy();
  });

  it("does not turn a core dashboard failure into an empty opponent state", async () => {
    loadMyTeamDashboard.mockRejectedValue(new Error("database unavailable"));

    render(await MyTeamScoutingPageView({ league: "premier", searchParams: Promise.resolve({}) }));

    expect(screen.getByText("My Team is temporarily unavailable.")).toBeTruthy();
    expect(screen.queryByText(/no upcoming opponent/i)).toBeNull();
  });
});
