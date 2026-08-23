import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { from, fetchCaptainContext, fetchMyRoster, fetchScoutingHistory } = vi.hoisted(() => ({
  from: vi.fn(),
  fetchCaptainContext: vi.fn(),
  fetchMyRoster: vi.fn(),
  fetchScoutingHistory: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ from })) }));
vi.mock("@/lib/captain/queries", () => ({ fetchCaptainContext, fetchMyRoster }));
vi.mock("@/lib/scouting/queries", () => ({ fetchScoutingHistory }));
vi.mock("@/components/captain/CaptainGate", () => ({ default: () => <main>Captains only</main> }));
vi.mock("@/components/captain/OpponentScout", () => ({ default: (props: { source: { opponentName: string } }) => <section>Scouting dashboard: {props.source.opponentName}</section> }));
vi.mock("@/components/LeaguePageToggle", () => ({ default: () => null }));

import ScoutingPage, { CaptainScoutingPageView } from "./page";

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

const fixture = {
  id: "f",
  season: "S5",
  stage: "week_1" as const,
  division: null,
  team_a: "Team One",
  team_b: "Night Vale",
  scheduled_at: "2026-09-01T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-16T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Captain scouting page", () => {
  it("renders the dedicated scouting dashboard for the next opponent", async () => {
    const teams = [{ id: "one", name: "Team One" }, { id: "two", name: "Night Vale" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams, activeTeams: teams, myTeamId: "one", season: "S5" });
    fetchMyRoster.mockImplementation(async (_supabase: unknown, id: string) => id === "two" ? { draftPlayers: [{ id: "opp", display_name: "Mid", role: "mid" }], riotAccounts: [] } : { draftPlayers: [], riotAccounts: [] });
    fetchScoutingHistory.mockResolvedValue({ fixtures: [fixture], drafts: [] });
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [fixture] }) : query({ data: { current_phase: "Regular" } }));

    render(await ScoutingPage({ searchParams: Promise.resolve({}) }));

    expect(fetchScoutingHistory).toHaveBeenCalledWith(expect.anything(), { league: "premier", leagueTeamNames: ["Team One", "Night Vale"] });
    expect(screen.getByText("Scouting dashboard: Night Vale")).toBeTruthy();
  });

  it("keeps the page available with a safe error state", async () => {
    const teams = [{ id: "one", name: "Team One" }, { id: "two", name: "Night Vale" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams, activeTeams: teams, myTeamId: "one", season: "S5" });
    fetchMyRoster.mockResolvedValue({ draftPlayers: [], riotAccounts: [] });
    fetchScoutingHistory.mockRejectedValue(new Error("unavailable"));
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [fixture] }) : query({ data: { current_phase: "Regular" } }));

    render(await CaptainScoutingPageView({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Scouting data is temporarily unavailable.")).toBeTruthy();
  });
});
