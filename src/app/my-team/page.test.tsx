import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyTeamReadyDashboard } from "@/lib/my-team/types";

const {
  serverClient,
  from,
  loadMyTeamDashboard,
  fetchMyReports,
  fetchStaffTier,
  reportBox,
  adminCodeEditor,
  adminReportsQueue,
  leagueTeamsEditor,
  rosterEditor,
} = vi.hoisted(() => ({
  serverClient: { from: vi.fn() },
  from: vi.fn(),
  loadMyTeamDashboard: vi.fn(),
  fetchMyReports: vi.fn(),
  fetchStaffTier: vi.fn(),
  reportBox: vi.fn((props: unknown) => {
    void props;
    return <section>Report a Result</section>;
  }),
  adminCodeEditor: vi.fn((props: unknown) => {
    void props;
    return <section>Admin code editor</section>;
  }),
  adminReportsQueue: vi.fn((props: unknown) => {
    void props;
    return <section>Admin reports queue</section>;
  }),
  leagueTeamsEditor: vi.fn((props: unknown) => {
    void props;
    return <section>League teams editor</section>;
  }),
  rosterEditor: vi.fn((props: unknown) => {
    void props;
    return <section>Roster editor</section>;
  }),
}));

serverClient.from = from;

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => serverClient),
}));
vi.mock("@/lib/my-team/queries", () => ({ loadMyTeamDashboard }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/captain/queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/captain/queries")>();
  return { ...original, fetchMyReports };
});
vi.mock("@/components/captain/ReportBox", () => ({
  default: (props: unknown) => reportBox(props),
}));
vi.mock("@/components/captain/AdminCodeEditor", () => ({
  default: (props: unknown) => adminCodeEditor(props),
}));
vi.mock("@/components/captain/AdminReportsQueue", () => ({
  default: (props: unknown) => adminReportsQueue(props),
}));
vi.mock("@/components/matches/LeagueTeamsEditor", () => ({
  default: (props: unknown) => leagueTeamsEditor(props),
}));
vi.mock("@/components/matches/RosterEditor", () => ({
  default: (props: unknown) => rosterEditor(props),
}));
vi.mock("@/components/LeaguePageToggle", () => ({ default: () => null }));

import { MyTeamPageView } from "./view";

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
    codes: [{
      id: "code-1",
      fixture_id: fixture.id,
      season: "S5",
      team_a_id: "team-1",
      team_b_id: "team-2",
      game_number: 1,
      code: "TOURNEY-CODE",
      note: null,
      created_by: null,
      created_at: "2026-08-01T00:00:00Z",
    }],
    draftGames: [],
    schedule: [fixture],
    roster: {
      draftPlayers: [{
        id: "draft-player-1",
        draft_id: "draft-1",
        display_name: "Signed In Player",
        role: "mid",
        rank: null,
        opgg_url: null,
        notes: null,
        canonical_player_id: "pool-1",
        team_id: "draft-team-1",
        price: 10,
        acquisition: "auction",
      }],
      riotAccounts: [],
      multiOpggUrl: null,
    },
    opponent: {
      team: teams[1],
      name: "Enemy Team",
      roster: { draftPlayers: [], riotAccounts: [] },
      multiOpggUrl: null,
      scoutingUnavailable: false,
    },
    results: { games: [], players: [] },
    isCaptain: false,
    isAdmin: false,
    ...overrides,
  };
}

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  fetchMyReports.mockResolvedValue([]);
  fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
  from.mockImplementation((table: string) => {
    if (table === "league_settings") return query({ data: { current_phase: "Regular" }, error: null });
    if (table === "fixtures") return query({ data: [fixture], error: null });
    return query({ data: [], error: null });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("My Team page", () => {
  it("renders the complete player-safe dashboard without mutation controls", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready());

    render(await MyTeamPageView({
      league: "premier",
      searchParams: Promise.resolve({ team: "browser-forged-team" }),
    }));

    expect(screen.getByRole("heading", { name: /next match/i })).toBeTruthy();
    expect(screen.getByText("TOURNEY-CODE")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /team schedule/i })).toBeTruthy();
    expect(screen.getByText("Signed In Player")).toBeTruthy();
    expect(screen.getByRole("link", { name: /watch draft/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1");
    expect(screen.getByRole("link", { name: /scout opponent/i }).getAttribute("href"))
      .toBe("/my-team/scouting");
    expect(screen.queryByText("Report a Result")).toBeNull();
    expect(screen.queryByText("Admin code editor")).toBeNull();
    expect(fetchMyReports).not.toHaveBeenCalled();
    expect(loadMyTeamDashboard).toHaveBeenCalledWith(serverClient, "premier", "browser-forged-team");
  });

  it("adds result reporting for the exact resolved captain team", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready({
      isCaptain: true,
      draftGames: [
        {
          gameNumber: 1,
          status: "complete",
          started: true,
          blueTeamId: "team-1",
          winnerTeamId: "team-1",
        },
        {
          gameNumber: 2,
          status: "complete",
          started: true,
          blueTeamId: "team-2",
          winnerTeamId: "team-1",
        },
      ],
    }));

    render(await MyTeamPageView({ league: "premier", searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Report a Result")).toBeTruthy();
    expect(fetchMyReports).toHaveBeenCalledWith(serverClient, "team-1", "S5");
    expect(reportBox).toHaveBeenCalledWith(expect.objectContaining({
      defaultSeason: "S5",
      fixtureId: "fixture-1",
      prefillTeamAId: "team-1",
      prefillTeamBId: "team-2",
      draftPrefill: {
        draftUrl: "/match-draft/fixture-1",
        games: [
          { gameNumber: 1, blueTeamId: "team-1" },
          { gameNumber: 2, blueTeamId: "team-2" },
        ],
        scoreA: 2,
        scoreB: 0,
      },
    }));
    expect(screen.queryByText("Admin code editor")).toBeNull();
  });

  it("adds the canonical team switcher and existing editors only for admins", async () => {
    loadMyTeamDashboard.mockResolvedValue(ready({ isAdmin: true }));

    const { container } = render(await MyTeamPageView({
      league: "premier",
      searchParams: Promise.resolve({ team: "team-1" }),
    }));

    expect(screen.getByText("Report a Result")).toBeTruthy();
    expect(screen.getByText("Admin code editor")).toBeTruthy();
    expect(screen.getByText("Admin reports queue")).toBeTruthy();
    expect(screen.getByText("Roster editor")).toBeTruthy();
    expect(container.querySelector("form[method='get']")?.getAttribute("action")).toBe("/my-team");
    expect(fetchStaffTier).toHaveBeenCalledWith(serverClient);
  });

  it("excludes mixed-league fixtures, reports, and codes from Academy admin editors", async () => {
    const mixedFixture = {
      ...fixture,
      id: "mixed-fixture",
      team_b: "Outside Team",
    };
    const validReport = {
      id: "report-valid",
      season: "S5",
      season_phase: "Regular",
      team_a_id: "team-1",
      team_b_id: "team-2",
      score_a: 2,
      score_b: 0,
      draft_url: null,
      submitted_by: "admin",
      submitted_at: "2026-08-01T00:00:00Z",
      status: "pending",
      error_text: null,
      warning_text: null,
      ingested_at: null,
      fixture_id: fixture.id,
    };
    const mixedReport = { ...validReport, id: "report-mixed", team_b_id: "outside-team" };
    const validCode = {
      id: "code-valid",
      fixture_id: fixture.id,
      season: "S5",
      team_a_id: "team-1",
      team_b_id: "team-2",
      game_number: 1,
      code: "VALID",
      note: null,
      created_by: "admin",
      created_at: "2026-08-01T00:00:00Z",
    };
    const mixedCode = { ...validCode, id: "code-mixed", team_b_id: "outside-team", code: "MIXED" };
    loadMyTeamDashboard.mockResolvedValue(ready({ isAdmin: true, league: "academy" }));
    from.mockImplementation((table: string) => {
      if (table === "league_settings") return query({ data: { current_phase: "Regular" }, error: null });
      if (table === "fixtures") return query({ data: [fixture, mixedFixture], error: null });
      if (table === "match_reports") return query({ data: [validReport, mixedReport], error: null });
      if (table === "match_codes") return query({ data: [validCode, mixedCode], error: null });
      return query({ data: [], error: null });
    });

    render(await MyTeamPageView({ league: "academy", searchParams: Promise.resolve({}) }));

    expect(adminCodeEditor).toHaveBeenCalledWith(expect.objectContaining({
      fixtures: [fixture],
      codes: [validCode],
    }));
    expect(adminReportsQueue).toHaveBeenCalledWith(expect.objectContaining({
      reports: [validReport],
    }));
  });

  it("keeps core query failures distinct from onboarding states", async () => {
    loadMyTeamDashboard.mockRejectedValue(new Error("database unavailable"));

    render(await MyTeamPageView({ league: "premier", searchParams: Promise.resolve({}) }));

    expect(screen.getByText("My Team is temporarily unavailable.")).toBeTruthy();
    expect(screen.queryByText(/sign in to see your team/i)).toBeNull();
  });
});
