import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  from,
  fetchCaptainContext,
  fetchCodes,
  fetchDraftGames,
  fetchMyReports,
  fetchMyResults,
  fetchMyRoster,
  fetchAnnouncements,
  adminCodeEditor,
  myRoster,
} = vi.hoisted(() => ({
  from: vi.fn(),
  fetchCaptainContext: vi.fn(),
  fetchCodes: vi.fn(),
  fetchDraftGames: vi.fn(async () => []),
  fetchMyReports: vi.fn(),
  fetchMyResults: vi.fn(),
  fetchMyRoster: vi.fn(),
  fetchAnnouncements: vi.fn(),
  adminCodeEditor: vi.fn((props: unknown) => {
    void props;
    return null;
  }),
  myRoster: vi.fn((props: unknown) => {
    void props;
    return <section>My roster</section>;
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ from })),
}));

vi.mock("@/lib/captain/queries", () => ({
  fetchAnnouncements,
  fetchCaptainContext,
  fetchCodes,
  fetchDraftGames,
  fetchMyReports,
  fetchMyResults,
  fetchMyRoster,
  MatchCode: {},
}));

vi.mock("@/components/captain/NextMatchCard", () => ({ default: () => <section>Next Match</section> }));
vi.mock("@/components/captain/TourneyCodes", () => ({ default: () => <section>Tourney Codes</section> }));
vi.mock("@/components/captain/ReportBox", () => ({ default: () => <section>Report a Result</section> }));
vi.mock("@/components/captain/MyRoster", () => ({
  default: (props: unknown) => myRoster(props),
}));
vi.mock("@/components/captain/MyResults", () => ({ default: () => <section>My results &amp; stats</section> }));
vi.mock("@/components/captain/Announcements", () => ({ default: () => <section>Announcements</section> }));
vi.mock("@/components/captain/CaptainGate", () => ({ default: () => <main>Captains only</main> }));
vi.mock("@/components/captain/AdminCodeEditor", () => ({
  default: (props: unknown) => adminCodeEditor(props),
}));
vi.mock("@/components/captain/AdminReportsQueue", () => ({ default: () => null }));
vi.mock("@/components/matches/LeagueTeamsEditor", () => ({ default: () => null }));
vi.mock("@/components/matches/RosterEditor", () => ({ default: () => null }));

import CaptainPage, { CaptainPageView } from "./page";

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function fixture(id: string, teamA: string, teamB: string) {
  return {
    id,
    season: "S5",
    stage: "week_1" as const,
    division: null,
    team_a: teamA,
    team_b: teamB,
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-16T00:00:00Z",
  };
}

function mockCaptainData() {
  fetchCodes.mockResolvedValue([]);
  fetchMyReports.mockResolvedValue([]);
  fetchMyRoster.mockResolvedValue({ draftPlayers: [], riotAccounts: [] });
  fetchMyResults.mockResolvedValue({ games: [], players: [] });
  fetchAnnouncements.mockResolvedValue([]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CaptainPage layout", () => {
  it("uses a wide responsive action layout and keeps lower sections below it", async () => {
    const team = { id: "team-1", name: "Team One" };
    fetchCaptainContext.mockResolvedValue({
      profileId: "profile-1",
      isAdmin: false,
      teams: [team],
      activeTeams: [team],
      myTeamId: team.id,
      season: "S5",
    });
    fetchCodes.mockResolvedValue([]);
    fetchMyReports.mockResolvedValue([]);
    fetchMyRoster.mockResolvedValue({ draftPlayers: [], riotAccounts: [] });
    fetchMyResults.mockResolvedValue({ games: [], players: [] });
    fetchAnnouncements.mockResolvedValue([]);
    from.mockImplementation((table: string) =>
      table === "fixtures" ? query({ data: [] }) : query({ data: { current_phase: "Regular" } }),
    );

    render(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector(".max-w-\\[1800px\\]")).not.toBeNull();
    expect(document.querySelector(".lg\\:grid-cols-2")).not.toBeNull();
    const labels = [
      "Next Match",
      "Tourney Codes",
      "My roster",
      "Report a Result",
      "My results & stats",
      "Announcements",
    ];
    expect(labels.slice(0, -1).every((label, index) =>
      screen.getByText(label).compareDocumentPosition(screen.getByText(labels[index + 1])) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    )).toBe(true);
  });

  it("passes only current featured-draft fixtures to the Premier admin editor", async () => {
    const premierTeams = [
      { id: "premier-a", name: "Premier A" },
      { id: "premier-b", name: "Premier B" },
    ];
    fetchCaptainContext.mockResolvedValue({
      profileId: "admin",
      isAdmin: true,
      teams: premierTeams,
      activeTeams: premierTeams,
      myTeamId: null,
      season: "S5",
    });
    mockCaptainData();
    const seasonFixtures = [
      fixture("premier", "Premier A", "Premier B"),
      fixture("academy", "Academy A", "Academy B"),
      fixture("mixed", "Premier A", "Academy A"),
    ];
    from.mockImplementation((table: string) => {
      if (table === "fixtures") return query({ data: seasonFixtures });
      if (table === "league_settings") return query({ data: { current_phase: "Regular" } });
      return query({ data: [] });
    });

    render(await CaptainPageView({ searchParams: Promise.resolve({}), league: "premier" }));

    expect(adminCodeEditor).toHaveBeenCalledWith(expect.objectContaining({
      fixtures: [seasonFixtures[0]],
      enableBulkImporter: true,
    }));
  });

  it("enables the bulk importer on the Academy captain page", async () => {
    const academyTeams = [
      { id: "academy-a", name: "Academy A" },
      { id: "academy-b", name: "Academy B" },
    ];
    fetchCaptainContext.mockResolvedValue({
      profileId: "admin",
      isAdmin: true,
      teams: academyTeams,
      activeTeams: academyTeams,
      myTeamId: null,
      season: "S5",
    });
    mockCaptainData();
    const seasonFixtures = [
      fixture("premier", "Premier A", "Premier B"),
      fixture("academy", "Academy A", "Academy B"),
    ];
    from.mockImplementation((table: string) => {
      if (table === "fixtures") return query({ data: seasonFixtures });
      if (table === "league_settings") return query({ data: { current_phase: "Regular" } });
      return query({ data: [] });
    });

    render(await CaptainPageView({ searchParams: Promise.resolve({}), league: "academy" }));

    expect(adminCodeEditor).toHaveBeenCalledWith(expect.objectContaining({
      fixtures: [seasonFixtures[1]],
      enableBulkImporter: true,
    }));
  });

  // Regression: the admin team switcher posted to a hardcoded /captain, so
  // switching teams on the Academy page landed on Premier, where the ?team=
  // matched no Premier team and the page fell back to the first one.
  it.each([
    ["academy", "/academy/captain"],
    ["premier", "/captain"],
  ] as const)("points the %s team switcher at its own page", async (league, action) => {
    const teams = [
      { id: "team-a", name: "Team A" },
      { id: "team-b", name: "Team B" },
    ];
    fetchCaptainContext.mockResolvedValue({
      profileId: "admin",
      isAdmin: true,
      isOwner: false,
      teams,
      activeTeams: teams,
      myTeamId: null,
      season: "S5",
    });
    mockCaptainData();
    from.mockImplementation((table: string) => {
      if (table === "league_settings") return query({ data: { current_phase: "Regular" } });
      return query({ data: [] });
    });

    const { container } = render(
      await CaptainPageView({ searchParams: Promise.resolve({}), league }),
    );

    expect(container.querySelector("form[method='get']")?.getAttribute("action")).toBe(action);
  });

  it("passes the computed multi-OP.GG URL to the roster card", async () => {
    const team = { id: "team-1", name: "Team One" };
    fetchCaptainContext.mockResolvedValue({
      profileId: "profile-1",
      isAdmin: false,
      teams: [team],
      activeTeams: [team],
      myTeamId: team.id,
      season: "S5",
    });
    fetchCodes.mockResolvedValue([]);
    fetchMyReports.mockResolvedValue([]);
    fetchMyRoster.mockResolvedValue({
      draftPlayers: [
        {
          id: "player-1",
          role: "top",
          display_name: "Rift Maker",
          price: 10,
          acquisition: null,
          opgg_url: "https://op.gg/lol/summoners/na/RiftMaker-NA1",
        },
      ],
      riotAccounts: [],
    });
    fetchMyResults.mockResolvedValue({ games: [], players: [] });
    fetchAnnouncements.mockResolvedValue([]);
    from.mockImplementation((table: string) =>
      table === "fixtures" ? query({ data: [] }) : query({ data: { current_phase: "Regular" } }),
    );

    render(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(myRoster).toHaveBeenCalledWith(
      expect.objectContaining({
        multiOpggUrl: "https://op.gg/lol/multisearch/na?summoners=RiftMaker%23NA1",
      }),
    );
  });
});
