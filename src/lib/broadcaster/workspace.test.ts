import { afterEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import { loadBroadcasterScouting, resolveBroadcasterFixture } from "./workspace";

const {
  fetchCaptainContext,
  fetchHomepageSchedule,
  fetchHomepageFeaturedSettings,
  selectHomepageFeaturedFixture,
  fetchAcademyDraftData,
  filterAcademyFixtures,
  academyTeamNames,
  fetchMyRoster,
  fetchScoutingHistory,
  fetchIngestedScoutingGames,
  fetchInhousePlayerStats,
  fetchBroadcasterPlayerDetails,
} = vi.hoisted(() => ({
  fetchCaptainContext: vi.fn(),
  fetchHomepageSchedule: vi.fn(),
  fetchHomepageFeaturedSettings: vi.fn(),
  selectHomepageFeaturedFixture: vi.fn(),
  fetchAcademyDraftData: vi.fn(),
  filterAcademyFixtures: vi.fn(),
  academyTeamNames: vi.fn(),
  fetchMyRoster: vi.fn(),
  fetchScoutingHistory: vi.fn(),
  fetchIngestedScoutingGames: vi.fn(),
  fetchInhousePlayerStats: vi.fn(),
  fetchBroadcasterPlayerDetails: vi.fn(),
}));

vi.mock("@/lib/captain/queries", () => ({ fetchCaptainContext, fetchMyRoster }));
vi.mock("@/lib/home/schedule", () => ({ fetchHomepageSchedule, selectHomepageFeaturedFixture }));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/academy/filtering", () => ({ filterAcademyFixtures }));
vi.mock("@/lib/league/context", () => ({ academyTeamNames }));
vi.mock("@/lib/scouting/queries", () => ({ fetchScoutingHistory, fetchIngestedScoutingGames, fetchInhousePlayerStats }));
vi.mock("./playerDetails", () => ({ fetchBroadcasterPlayerDetails }));

const supabase = {} as never;
const teams = [
  { id: "alpha-id", name: "Alpha", abbreviation: "A", active: true },
  { id: "beta-id", name: "Beta", abbreviation: "B", active: true },
];

function fixture(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "featured-1",
    season: "S5",
    stage: "week_1",
    division: "Solari",
    team_a: "Alpha",
    team_b: "Beta",
    scheduled_at: "2026-08-24T00:00:00Z",
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const settings = {
  fixtureId: "featured-1",
  title: null,
  description: null,
  twitchUrl: "https://www.twitch.tv/fpl",
};

function captainContext(season = "S5") {
  return {
    profileId: null,
    isAdmin: false,
    isOwner: false,
    teams,
    activeTeams: teams,
    myTeamId: null,
    season,
  };
}

function arrangeFixtureResolution() {
  fetchCaptainContext.mockResolvedValue(captainContext());
  fetchHomepageSchedule.mockResolvedValue({
    season: "S5",
    isNewestSeason: true,
    activeStage: "week_1",
    fixtures: [fixture()],
  });
  fetchHomepageFeaturedSettings.mockResolvedValue(settings);
  fetchAcademyDraftData.mockResolvedValue({ draft: null, teams: [], players: [], profiles: [] });
  selectHomepageFeaturedFixture.mockImplementation((fixtures: FixtureRow[]) => fixtures[0] ?? null);
}

afterEach(() => vi.resetAllMocks());

describe("resolveBroadcasterFixture", () => {
  it("loads the Premier homepage schedule without a scope and selects its configured fixture", async () => {
    arrangeFixtureResolution();

    await expect(resolveBroadcasterFixture(supabase, "premier")).resolves.toMatchObject({
      league: "premier",
      season: "S5",
      fixture: { id: "featured-1" },
      settings: { fixtureId: "featured-1", twitchUrl: "https://www.twitch.tv/fpl" },
    });

    expect(fetchCaptainContext).toHaveBeenCalledWith(supabase, "premier");
    expect(fetchHomepageSchedule).toHaveBeenCalledWith();
    expect(selectHomepageFeaturedFixture).toHaveBeenCalledWith([fixture()], "featured-1");
  });

  it("scopes Academy schedules to Academy fixtures before selecting the featured fixture", async () => {
    arrangeFixtureResolution();
    const academyTeams = [{ name: "Alpha" }, { name: "Beta" }];
    fetchAcademyDraftData.mockResolvedValue({ draft: null, teams: academyTeams, players: [], profiles: [] });
    academyTeamNames.mockReturnValue(new Set(["alpha"]));
    filterAcademyFixtures.mockImplementation((fixtures: FixtureRow[], names: Set<string>) =>
      fixtures.filter((row) => names.has(row.team_a?.trim().toLowerCase() ?? "")),
    );

    await resolveBroadcasterFixture(supabase, "academy");

    const scope = fetchHomepageSchedule.mock.calls[0]?.[0] as (fixtures: FixtureRow[]) => FixtureRow[];
    expect(scope([fixture(), fixture({ id: "premier-only", team_a: "Gamma", team_b: "Delta" })])).toEqual([fixture()]);
    expect(academyTeamNames).toHaveBeenCalledWith(academyTeams);
    expect(filterAcademyFixtures).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "featured-1" })]),
      new Set(["alpha"]),
    );
    expect(fetchHomepageFeaturedSettings).toHaveBeenCalledWith("academy");
  });

  it("uses the legacy Academy draft teams to select the homepage fixture when captain context has no teams", async () => {
    arrangeFixtureResolution();
    const academyFixture = fixture({ id: "academy-featured", team_a: "Academy Alpha", team_b: "Academy Beta" });
    const unrelatedFixture = fixture({ id: "premier-only", team_a: "Premier Alpha", team_b: "Premier Beta" });
    fetchCaptainContext.mockResolvedValue({ ...captainContext(), teams: [], activeTeams: [] });
    fetchAcademyDraftData.mockResolvedValue({
      draft: null,
      teams: [{ name: "Academy Alpha" }, { name: "Academy Beta" }],
      players: [],
      profiles: [],
    });
    academyTeamNames.mockImplementation((draftTeams: Array<{ name: string }>) =>
      new Set(draftTeams.map((team) => team.name.trim().toLowerCase())),
    );
    filterAcademyFixtures.mockImplementation((fixtures: FixtureRow[], names: Set<string>) =>
      fixtures.filter((row) => names.has(row.team_a?.trim().toLowerCase() ?? "")),
    );
    fetchHomepageSchedule.mockImplementation(async (scope?: (fixtures: FixtureRow[]) => FixtureRow[]) => ({
      season: "A1",
      isNewestSeason: true,
      activeStage: "week_1",
      fixtures: scope ? scope([academyFixture, unrelatedFixture]) : [academyFixture, unrelatedFixture],
    }));

    await expect(resolveBroadcasterFixture(supabase, "academy")).resolves.toMatchObject({
      fixture: { id: "academy-featured" },
    });
  });

  it("falls back to the first active fixture when no fixture is configured", async () => {
    arrangeFixtureResolution();
    fetchHomepageFeaturedSettings.mockResolvedValue({ ...settings, fixtureId: null });
    const automatic = fixture({ id: "automatic" });
    fetchHomepageSchedule.mockResolvedValue({
      season: "S5",
      isNewestSeason: true,
      activeStage: "week_1",
      fixtures: [automatic],
    });

    await expect(resolveBroadcasterFixture(supabase, "premier")).resolves.toMatchObject({ fixture: automatic });
    expect(selectHomepageFeaturedFixture).toHaveBeenCalledWith([automatic], null);
  });
});

describe("loadBroadcasterScouting", () => {
  function context(overrides: Partial<Awaited<ReturnType<typeof resolveBroadcasterFixture>>> = {}) {
    return { league: "premier" as const, season: "S5", teams, fixture: fixture(), settings, ...overrides };
  }

  function arrangeScouting() {
    fetchScoutingHistory.mockResolvedValue({ fixtures: [], drafts: [] });
    fetchMyRoster.mockImplementation(async (_client: unknown, teamId: string) => ({
      draftPlayers: teamId === "alpha-id"
        ? [{ id: "alpha-player", display_name: "Alpha Mid", role: "mid" }]
        : [{ id: "beta-player", display_name: "Beta Top", role: "top" }],
      riotAccounts: [],
    }));
    fetchInhousePlayerStats.mockResolvedValue([
      { playerId: "alpha-player", playerName: "Alpha Mid", role: "mid", games: 2, champions: [] },
      { playerId: "beta-player", playerName: "Beta Top", role: "top", games: 1, champions: [] },
    ]);
    fetchIngestedScoutingGames.mockResolvedValue([]);
    fetchBroadcasterPlayerDetails.mockResolvedValue([]);
  }

  it("loads one shared history and in-house result while preserving each featured roster", async () => {
    arrangeScouting();
    fetchIngestedScoutingGames.mockResolvedValue([
      { playerId: "alpha-player", playerName: "Alpha Mid", role: "mid", champion: "Ahri", fixtureId: "fixture-1", season: "S5", matchId: "match-a", gameDate: null },
      { playerId: "beta-player", playerName: "Beta Top", role: "top", champion: "Garen", fixtureId: "fixture-1", season: "S5", matchId: "match-b", gameDate: null },
    ]);

    const data = await loadBroadcasterScouting(supabase, context());

    expect(fetchScoutingHistory).toHaveBeenCalledTimes(1);
    expect(fetchScoutingHistory).toHaveBeenCalledWith(supabase, {
      league: "premier",
      leagueTeamNames: ["Alpha", "Beta"],
    });
    expect(fetchMyRoster).toHaveBeenCalledWith(supabase, "alpha-id", "S5", "premier");
    expect(fetchMyRoster).toHaveBeenCalledWith(supabase, "beta-id", "S5", "premier");
    expect(fetchInhousePlayerStats).toHaveBeenCalledTimes(1);
    expect(fetchInhousePlayerStats).toHaveBeenCalledWith(supabase, [
      { id: "alpha-player", displayName: "Alpha Mid", role: "mid" },
      { id: "beta-player", displayName: "Beta Top", role: "top" },
    ]);
    expect(fetchIngestedScoutingGames).toHaveBeenCalledWith(supabase, [
      { id: "alpha-player", displayName: "Alpha Mid", role: "mid" },
      { id: "beta-player", displayName: "Beta Top", role: "top" },
    ], []);
    expect(fetchBroadcasterPlayerDetails).toHaveBeenCalledWith(supabase, "S5", [
      { id: "alpha-player", displayName: "Alpha Mid", role: "mid" },
      { id: "beta-player", displayName: "Beta Top", role: "top" },
    ]);
    expect(data?.teamA.opponentName).toBe("Alpha");
    expect(data?.teamB.opponentName).toBe("Beta");
    expect(data?.teamA.inhousePlayerStats?.map((row: { playerId: string }) => row.playerId)).toEqual(["alpha-player"]);
    expect(data?.teamB.inhousePlayerStats?.map((row: { playerId: string }) => row.playerId)).toEqual(["beta-player"]);
    expect(data?.teamA.ingestedGames?.map((row) => row.playerId)).toEqual(["alpha-player"]);
    expect(data?.teamB.ingestedGames?.map((row) => row.playerId)).toEqual(["beta-player"]);
  });

  it("returns null without loading scouting when no featured fixture exists", async () => {
    await expect(loadBroadcasterScouting(supabase, context({ fixture: null }))).resolves.toBeNull();

    expect(fetchScoutingHistory).not.toHaveBeenCalled();
    expect(fetchMyRoster).not.toHaveBeenCalled();
  });

  it("keeps shared history when one featured team does not match a league team", async () => {
    arrangeScouting();

    const data = await loadBroadcasterScouting(supabase, context({ fixture: fixture({ team_b: "Unknown" }) }));

    expect(fetchScoutingHistory).toHaveBeenCalledTimes(1);
    expect(fetchScoutingHistory).toHaveBeenCalledWith(supabase, {
      league: "premier",
      leagueTeamNames: ["Alpha", "Beta", "Unknown"],
    });
    expect(fetchMyRoster).toHaveBeenCalledTimes(1);
    expect(data?.teamB.roster).toEqual([]);
    expect(data?.teamB.inhousePlayerStats).toEqual([]);
  });
});
