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
  fetchScoutingHistory,
  opponentScout,
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
  fetchScoutingHistory: vi.fn(),
  opponentScout: vi.fn((props: { source: { opponentName: string } }) => <section>Scouting: {props.source.opponentName}</section>),
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

vi.mock("@/lib/scouting/queries", () => ({ fetchScoutingHistory }));

vi.mock("@/components/captain/NextMatchCard", () => ({ default: () => <section>Next Match</section> }));
vi.mock("@/components/captain/OpponentScout", () => ({ default: (props: { source: { opponentName: string } }) => opponentScout(props) }));
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

function upcomingFixture(id: string, teamA: string, teamB: string) {
  return { ...fixture(id, teamA, teamB), scheduled_at: "2026-09-01T00:00:00Z" };
}

function mockCaptainData() {
  fetchCodes.mockResolvedValue([]);
  fetchMyReports.mockResolvedValue([]);
  fetchMyRoster.mockResolvedValue({ draftPlayers: [], riotAccounts: [] });
  fetchMyResults.mockResolvedValue({ games: [], players: [] });
  fetchAnnouncements.mockResolvedValue([]);
  fetchScoutingHistory.mockResolvedValue({ fixtures: [], drafts: [] });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CaptainPage layout", () => {
  it("links the Premier captain hub to the dedicated Scouting page", async () => {
    const teams = [{ id: "one", name: "Team One" }, { id: "two", name: "Night Vale" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams, activeTeams: teams, myTeamId: "one", season: "S5" });
    mockCaptainData();
    fetchMyRoster.mockImplementation(async (_s, id) => id === "two" ? { draftPlayers: [{ id: "opp", display_name: "Mid", role: "mid" }], riotAccounts: [] } : { draftPlayers: [], riotAccounts: [] });
    const next = upcomingFixture("f", "Team One", "Night Vale");
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [next] }) : table === "league_settings" ? query({ data: { current_phase: "Regular" } }) : query({ data: [] }));
    render(await CaptainPageView({ searchParams: Promise.resolve({}), league: "premier" }));
    expect(fetchScoutingHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /scouting/i }).getAttribute("href")).toBe("/captain/scouting");
  });

  it("links the Academy captain hub to the dedicated Scouting page", async () => {
    const teams = [{ id: "one", name: "Academy One" }, { id: "two", name: "Academy Two" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams, activeTeams: teams, myTeamId: "one", season: "A5" });
    mockCaptainData();
    const next = upcomingFixture("f", "Academy One", "Academy Two");
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [next] }) : query({ data: { current_phase: "Regular" } }));
    render(await CaptainPageView({ searchParams: Promise.resolve({}), league: "academy" }));
    expect(fetchScoutingHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /scouting/i }).getAttribute("href")).toBe("/academy/captain/scouting");
  });

  it("does not load scouting without an upcoming fixture", async () => {
    const team = { id: "one", name: "Team One" };
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams: [team], activeTeams: [team], myTeamId: "one", season: "S5" });
    mockCaptainData();
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [] }) : query({ data: { current_phase: "Regular" } }));
    render(await CaptainPageView({ searchParams: Promise.resolve({}) }));
    expect(fetchScoutingHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /scouting/i })).toBeNull();
  });

  it("isolates a rejected scout query from the rest of the captain page", async () => {
    const teams = [{ id: "one", name: "Team One" }, { id: "two", name: "Night Vale" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "p", isAdmin: false, teams, activeTeams: teams, myTeamId: "one", season: "S5" });
    mockCaptainData();
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [upcomingFixture("f", "Team One", "Night Vale")] }) : query({ data: { current_phase: "Regular" } }));
    render(await CaptainPageView({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Next Match")).toBeTruthy();
    expect(screen.getByText("Tourney Codes")).toBeTruthy();
    expect(screen.getByText("Report a Result")).toBeTruthy();
    expect(screen.getByText("My roster")).toBeTruthy();
    expect(screen.getByText("My results & stats")).toBeTruthy();
    expect(screen.getByText("Announcements")).toBeTruthy();
    expect(fetchScoutingHistory).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /scouting/i })).toBeTruthy();
  });

  it("uses the admin-selected team when resolving the scout opponent", async () => {
    const teams = [{ id: "one", name: "Team One" }, { id: "two", name: "Team Two" }, { id: "three", name: "Team Three" }];
    fetchCaptainContext.mockResolvedValue({ profileId: "admin", isAdmin: true, teams, activeTeams: teams, myTeamId: null, season: "S5" });
    mockCaptainData();
    const next = upcomingFixture("f", "Team Two", "Team Three");
    from.mockImplementation((table: string) => table === "fixtures" ? query({ data: [next] }) : table === "league_settings" ? query({ data: { current_phase: "Regular" } }) : query({ data: [] }));
    render(await CaptainPageView({ searchParams: Promise.resolve({ team: "two" }) }));
    expect(screen.getByRole("heading", { name: "Team Two" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /scouting/i }).getAttribute("href")).toBe("/captain/scouting?team=two");
  });
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
