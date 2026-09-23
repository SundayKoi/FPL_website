import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolvePlayerIdentity,
  fetchCodes,
  fetchDraftGames,
  fetchMyResults,
  fetchMyRoster,
} = vi.hoisted(() => ({
  resolvePlayerIdentity: vi.fn(),
  fetchCodes: vi.fn(),
  fetchDraftGames: vi.fn(),
  fetchMyResults: vi.fn(),
  fetchMyRoster: vi.fn(),
}));

vi.mock("@/lib/players/identity", () => ({ resolvePlayerIdentity }));
vi.mock("@/lib/captain/queries", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/captain/queries")>();
  return {
    ...original,
    fetchCodes,
    fetchDraftGames,
    fetchMyResults,
    fetchMyRoster,
  };
});

import { loadMyTeamDashboard } from "./queries";

type Row = Record<string, unknown>;

const academyOne = { id: "academy-team-1", name: "Academy One", abbreviation: "A1", active: true };
const academyTwo = { id: "academy-team-2", name: "Academy Two", abbreviation: "A2", active: true };
const premierOne = { id: "premier-team-1", name: "Premier One", abbreviation: "P1", active: true };

const upcoming = {
  id: "academy-fixture-1",
  season: "A1",
  stage: "week_1",
  division: null,
  team_a: "Academy One",
  team_b: "Academy Two",
  scheduled_at: "2026-09-01T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2026-08-01T00:00:00Z",
};

const completed = {
  ...upcoming,
  id: "academy-fixture-complete",
  scheduled_at: "2026-08-01T00:00:00Z",
  score_a: 2,
  score_b: 0,
};

function identity(overrides: Partial<{
  profileId: string | null;
  status: "unlinked" | "pending" | "approved" | "approved_unrostered";
  linkId: string | null;
  playerPoolId: string | null;
  leagueTeamId: string | null;
  season: string;
  isCaptain: boolean;
  isAdmin: boolean;
}> = {}) {
  return {
    profileId: "profile-1",
    status: "approved" as const,
    linkId: "link-1",
    playerPoolId: "pool-1",
    leagueTeamId: academyOne.id,
    season: "A1",
    isCaptain: false,
    isAdmin: false,
    ...overrides,
  };
}

function fakeClient({
  fixtures = [upcoming],
  captainTeamIds = [],
  teamAggRows = [],
  matchReports = [],
  matchReportGames = [],
  playoffEntrants = [],
  leagueTeams = [academyOne, academyTwo, premierOne],
  draftTeams = [
    {
      id: "draft-academy-1",
      draft_id: "academy-draft",
      name: academyOne.name,
      image_url: "https://img.test/academy-one.png",
      banner_color: "#123456",
    },
    { id: "draft-academy-2", draft_id: "academy-draft", name: academyTwo.name },
    { id: "draft-premier-1", draft_id: "premier-draft", name: premierOne.name },
  ],
  errors = {},
}: {
  fixtures?: Row[];
  captainTeamIds?: string[];
  teamAggRows?: Row[];
  matchReports?: Row[];
  matchReportGames?: Row[];
  playoffEntrants?: Row[];
  leagueTeams?: Row[];
  draftTeams?: Row[];
  errors?: Partial<Record<string, { message: string }>>;
} = {}) {
  const tables: Record<string, Row[]> = {
    league_settings: [{ id: 1, featured_draft_id: "premier-draft", academy_draft_id: "academy-draft" }],
    league_teams: leagueTeams,
    teams: draftTeams,
    league_team_captains: captainTeamIds.map((league_team_id) => ({
      profile_id: "profile-1",
      season: "A1",
      league_team_id,
    })),
    fixtures,
    stats_team_agg: teamAggRows,
    match_reports: matchReports,
    match_report_games: matchReportGames,
    premier_playoff_entrants: playoffEntrants,
  };

  const from = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    const response = () => ({ data: errors[table] ? null : rows, error: errors[table] ?? null });
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      }),
      order: vi.fn(() => builder),
      single: vi.fn(async () => ({
        data: errors[table] ? null : rows[0] ?? null,
        error: errors[table] ?? null,
      })),
      then: (
        onFulfilled: (value: ReturnType<typeof response>) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(response()).then(onFulfilled, onRejected),
    };
    return builder;
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolvePlayerIdentity.mockResolvedValue(identity());
  fetchCodes.mockResolvedValue([{ id: "code-own", fixture_id: upcoming.id, game_number: 1, code: "OWN-CODE" }]);
  fetchDraftGames.mockResolvedValue([{ gameNumber: 1, status: "drafting", started: false, blueTeamId: null, winnerTeamId: null }]);
  fetchMyRoster.mockResolvedValue({
    draftPlayers: [{ id: "draft-player", canonical_player_id: "pool-1", display_name: "Player One", role: "mid" }],
    riotAccounts: [],
  });
  fetchMyResults.mockResolvedValue({ games: [], players: [] });
});

describe("loadMyTeamDashboard", () => {
  it("returns signed-out without exposing private dashboard data", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({ profileId: null, status: "unlinked", linkId: null, playerPoolId: null, leagueTeamId: null }));

    await expect(loadMyTeamDashboard(fakeClient() as never, "academy")).resolves.toEqual({
      kind: "signed-out",
      season: "A1",
    });
  });

  it("returns unlinked guidance for an ordinary signed-in visitor", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({ status: "unlinked", linkId: null, playerPoolId: null, leagueTeamId: null }));

    await expect(loadMyTeamDashboard(fakeClient() as never, "academy")).resolves.toMatchObject({
      kind: "unlinked",
      season: "A1",
      availableTeams: [academyOne, academyTwo],
    });
  });

  it("returns a pending claim without loading private team data", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({ status: "pending" }));

    await expect(loadMyTeamDashboard(fakeClient() as never, "academy")).resolves.toMatchObject({
      kind: "pending",
      linkId: "link-1",
      playerPoolId: "pool-1",
      leagueTeamId: academyOne.id,
    });
  });

  it("explains an approved identity that has no active roster", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({ status: "approved_unrostered", leagueTeamId: null }));

    await expect(loadMyTeamDashboard(fakeClient() as never, "academy")).resolves.toMatchObject({
      kind: "unrostered",
      playerPoolId: "pool-1",
      season: "A1",
    });
  });

  it("requires both fixture sides in the Academy set before next-match and scouting resolution", async () => {
    const mixedLeagueFixture = {
      ...upcoming,
      id: "mixed-league-fixture",
      team_a: "Academy One",
      team_b: "Outside Team",
      scheduled_at: "2026-08-31T00:00:00Z",
    };

    const result = await loadMyTeamDashboard(
      fakeClient({ fixtures: [mixedLeagueFixture, upcoming] }) as never,
      "academy",
    );

    expect(result).toMatchObject({
      kind: "ready",
      season: "A1",
      team: {
        ...academyOne,
        imageUrl: "https://img.test/academy-one.png",
        bannerColor: "#123456",
      },
      schedule: [{ id: upcoming.id }],
      nextFixture: { id: upcoming.id },
      opponent: { name: academyTwo.name },
      isCaptain: false,
      isAdmin: false,
    });
    expect(fetchCodes).toHaveBeenCalledWith(expect.anything(), upcoming.id);
  });

  it("accepts only an admin override that belongs to the active league set", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({
      status: "unlinked",
      linkId: null,
      playerPoolId: null,
      leagueTeamId: null,
      isAdmin: true,
    }));

    const selected = await loadMyTeamDashboard(fakeClient() as never, "academy", academyTwo.id);
    const forged = await loadMyTeamDashboard(fakeClient() as never, "academy", premierOne.id);

    expect(selected).toMatchObject({ kind: "ready", team: academyTwo, isAdmin: true });
    expect(forged).toMatchObject({ kind: "ready", team: academyOne, isAdmin: true });
  });

  it("ignores a forged team override from an ordinary player", async () => {
    const result = await loadMyTeamDashboard(fakeClient() as never, "academy", academyTwo.id);

    expect(result).toMatchObject({ kind: "ready", team: academyOne, isCaptain: false });
  });

  it("uses transferred player's new team for next-opponent context", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({
      leagueTeamId: academyTwo.id,
      playerPoolId: "pool-2",
    }));

    const result = await loadMyTeamDashboard(fakeClient() as never, "academy");

    expect(result).toMatchObject({
      kind: "ready",
      team: academyTwo,
      nextFixture: { id: upcoming.id },
      opponent: { name: academyOne.name },
    });
    expect(fetchMyRoster).toHaveBeenCalledWith(expect.anything(), academyTwo.id, "A1", "academy");
    expect(fetchMyRoster).toHaveBeenCalledWith(expect.anything(), academyOne.id, "A1", "academy");
  });

  it("uses a captain's validated team and ignores a forged override", async () => {
    resolvePlayerIdentity.mockResolvedValue(identity({
      status: "unlinked",
      linkId: null,
      playerPoolId: null,
      leagueTeamId: null,
      isCaptain: true,
    }));

    const result = await loadMyTeamDashboard(
      fakeClient({ captainTeamIds: [academyOne.id] }) as never,
      "academy",
      academyTwo.id,
    );

    expect(result).toMatchObject({ kind: "ready", team: academyOne, isCaptain: true });
  });

  it("loads codes only for the resolved team's next fixture", async () => {
    const unrelatedEarlierFixture = {
      ...upcoming,
      id: "other-fixture",
      team_a: "Academy Two",
      team_b: "Outside Team",
      scheduled_at: "2026-08-31T00:00:00Z",
    };
    fetchCodes.mockImplementation(async (_client: unknown, fixtureId: string) => fixtureId === upcoming.id
      ? [{ id: "code-own", fixture_id: upcoming.id, game_number: 1, code: "OWN-CODE" }]
      : [{ id: "code-other", fixture_id: fixtureId, game_number: 1, code: "OTHER-CODE" }]);

    const result = await loadMyTeamDashboard(
      fakeClient({ fixtures: [unrelatedEarlierFixture, upcoming] }) as never,
      "academy",
    );

    expect(result).toMatchObject({ kind: "ready", codes: [{ code: "OWN-CODE" }] });
  });

  it("moves on to the next fixture once the current one has a submitted report, even without a score", async () => {
    // Gauntlet night: round 1 is reported by both captains but the ingest
    // (which writes the score) does not run between rounds.
    const roundTwo = { ...upcoming, id: "academy-fixture-r2", scheduled_at: "2026-09-08T00:00:00Z", sort_order: 2 };
    const result = await loadMyTeamDashboard(
      fakeClient({
        fixtures: [upcoming, roundTwo],
        matchReports: [{ id: "report-1", season: "A1", fixture_id: upcoming.id, status: "pending" }],
      }) as never,
      "academy",
    );
    expect(result).toMatchObject({ kind: "ready", nextFixture: { id: roundTwo.id } });
  });

  it("retains the full team schedule when there is no upcoming match", async () => {
    const result = await loadMyTeamDashboard(
      fakeClient({ fixtures: [completed] }) as never,
      "academy",
    );

    expect(result).toMatchObject({
      kind: "ready",
      nextFixture: null,
      schedule: [{ id: completed.id, score_a: 2, score_b: 0 }],
      codes: [],
      draftGames: [],
    });
  });

  it("isolates an opponent scouting-roster failure from the rest of the dashboard", async () => {
    fetchMyRoster.mockImplementation(async (_client: unknown, teamId: string) => {
      if (teamId === academyTwo.id) throw new Error("opponent roster unavailable");
      return { draftPlayers: [], riotAccounts: [] };
    });

    const result = await loadMyTeamDashboard(fakeClient() as never, "academy");

    expect(result).toMatchObject({
      kind: "ready",
      team: academyOne,
      opponent: {
        name: academyTwo.name,
        roster: null,
        scoutingUnavailable: true,
        stats: null,
        statsUnavailable: false,
      },
    });
  });

  it("loads and merges only the next opponent's current-season aggregate stats", async () => {
    const client = fakeClient({
      teamAggRows: [
        {
          team_name: " academy two ", season: "A1", season_phase: "Regular", games: 2, wins: 2, losses: 0,
          winrate_pct: 100, avg_duration_min: 20, dragon_rate: 40, baron_rate: 20,
          first_blood_rate: 50, first_tower_rate: 60, avg_team_kills: 10,
        },
        {
          team_name: "Academy Two", season: "A1", season_phase: "Playoffs", games: 6, wins: 3, losses: 3,
          winrate_pct: 50, avg_duration_min: 30, dragon_rate: 60, baron_rate: 40,
          first_blood_rate: 70, first_tower_rate: 80, avg_team_kills: 14,
        },
        {
          team_name: "Academy Two", season: "S5", season_phase: "Regular", games: 20, wins: 20, losses: 0,
          winrate_pct: 100, avg_duration_min: 10, dragon_rate: 100, baron_rate: 100,
          first_blood_rate: 100, first_tower_rate: 100, avg_team_kills: 20,
        },
      ],
    });

    const result = await loadMyTeamDashboard(client as never, "academy");

    expect(client.from).toHaveBeenCalledWith("stats_team_agg");
    expect(result).toMatchObject({
      opponent: {
        name: "Academy Two",
        statsUnavailable: false,
        stats: {
          team_name: "Academy Two",
          season: "A1",
          games: 8,
          wins: 5,
          losses: 3,
          winrate_pct: 62.5,
          avg_duration_min: 27.5,
        },
      },
    });
  });

  it("keeps a missing aggregate row as a normal optional empty state", async () => {
    const result = await loadMyTeamDashboard(fakeClient() as never, "academy");

    expect(result).toMatchObject({ opponent: { stats: null, statsUnavailable: false } });
  });

  it("isolates aggregate stats failure from roster and core dashboard data", async () => {
    const result = await loadMyTeamDashboard(
      fakeClient({ errors: { stats_team_agg: { message: "stats unavailable" } } }) as never,
      "academy",
    );

    expect(result).toMatchObject({
      kind: "ready",
      roster: { draftPlayers: expect.any(Array) },
      opponent: { roster: { draftPlayers: expect.any(Array) }, stats: null, statsUnavailable: true },
    });
  });

  it("does not query opponent aggregate stats when there is no next fixture", async () => {
    const client = fakeClient({ fixtures: [completed], teamAggRows: [{ team_name: "Academy Two" }] });

    const result = await loadMyTeamDashboard(client as never, "academy");

    expect(result).toMatchObject({ kind: "ready", nextFixture: null, opponent: null });
    expect(client.from).not.toHaveBeenCalledWith("stats_team_agg");
  });

  it("keeps an unfinished playoff series visible when its report is failed", async () => {
    const names = [
      "Premier Solari One", "Premier Solari Two", "Premier Solari Three", "Premier Solari Four",
      "Premier Lunari One", "Premier Lunari Two", "Premier Lunari Three", "Premier Lunari Four",
    ];
    const premierLeagueTeams = names.map((name, index) => ({
      id: `premier-team-${index + 1}`,
      name,
      abbreviation: `P${index + 1}`,
      active: true,
    }));
    const premierDraftTeams = premierLeagueTeams.map((team) => ({
      id: `draft-${team.id}`,
      draft_id: "premier-draft",
      name: team.name,
    }));
    const playoffEntrants = premierLeagueTeams.map((team, index) => ({
      season: "S5",
      team_id: team.id,
      canonical_name: team.name,
      division: index < 4 ? "Solari" : "Lunari",
      seed: (index % 4) + 1,
    }));
    const qf = {
      ...upcoming,
      id: "premier-qf-0",
      season: "S5",
      stage: "quarterfinals",
      team_a: names[0],
      team_b: names[7],
      best_of: 5,
    };
    const semifinalSlots = [0, 1].map((sort_order) => ({
      ...qf,
      id: `premier-semi-${sort_order}`,
      stage: "semifinals",
      sort_order,
      team_a: null,
      team_b: null,
      scheduled_at: "2026-10-04T20:00:00-04:00",
    }));
    const failedReport = {
      id: "report-failed",
      fixture_id: qf.id,
      season: "S5",
      season_phase: "Playoffs",
      team_a_id: premierLeagueTeams[0].id,
      team_b_id: premierLeagueTeams[7].id,
      score_a: 2,
      score_b: 1,
      status: "failed",
      submitted_at: "2026-09-28T23:00:00Z",
      forfeit_team_id: null,
    };
    resolvePlayerIdentity.mockResolvedValue(identity({ season: "S5", leagueTeamId: premierLeagueTeams[0].id }));

    const result = await loadMyTeamDashboard(fakeClient({
      fixtures: [qf, ...semifinalSlots],
      matchReports: [failedReport],
      playoffEntrants,
      leagueTeams: premierLeagueTeams,
      draftTeams: premierDraftTeams,
    }) as never, "premier");

    expect(result).toMatchObject({
      kind: "ready",
      nextFixture: { id: qf.id },
      awaitingPlayoffDraw: false,
    });
  });

  it("shows a validated quarterfinal winner as awaiting the semifinal draw", async () => {
    const names = [
      "Premier Solari One", "Premier Solari Two", "Premier Solari Three", "Premier Solari Four",
      "Premier Lunari One", "Premier Lunari Two", "Premier Lunari Three", "Premier Lunari Four",
    ];
    const premierLeagueTeams = names.map((name, index) => ({
      id: `premier-team-${index + 1}`,
      name,
      abbreviation: `P${index + 1}`,
      active: true,
    }));
    const premierDraftTeams = premierLeagueTeams.map((team) => ({
      id: `draft-${team.id}`,
      draft_id: "premier-draft",
      name: team.name,
    }));
    const playoffEntrants = premierLeagueTeams.map((team, index) => ({
      season: "S5",
      team_id: team.id,
      canonical_name: team.name,
      division: index < 4 ? "Solari" : "Lunari",
      seed: (index % 4) + 1,
    }));
    const qf = {
      ...upcoming,
      id: "premier-qf-0",
      season: "S5",
      stage: "quarterfinals",
      team_a: names[0],
      team_b: names[7],
      best_of: 5,
    };
    const semifinalSlots = [0, 1].map((sort_order) => ({
      ...qf,
      id: `premier-semi-${sort_order}`,
      stage: "semifinals",
      sort_order,
      team_a: null,
      team_b: null,
      scheduled_at: "2026-10-04T20:00:00-04:00",
    }));
    const report = {
      id: "report-ready",
      fixture_id: qf.id,
      season: "S5",
      season_phase: "Playoffs",
      team_a_id: premierLeagueTeams[0].id,
      team_b_id: premierLeagueTeams[7].id,
      score_a: 3,
      score_b: 1,
      status: "pending",
      submitted_at: "2026-09-28T23:00:00Z",
      forfeit_team_id: null,
    };
    resolvePlayerIdentity.mockResolvedValue(identity({ season: "S5", leagueTeamId: premierLeagueTeams[0].id }));

    const result = await loadMyTeamDashboard(fakeClient({
      fixtures: [qf, ...semifinalSlots],
      matchReports: [report],
      playoffEntrants,
      leagueTeams: premierLeagueTeams,
      draftTeams: premierDraftTeams,
    }) as never, "premier");

    expect(result).toMatchObject({
      kind: "ready",
      nextFixture: null,
      awaitingPlayoffDraw: true,
    });
  });

  it("propagates an own-roster failure instead of returning a false ready dashboard", async () => {
    fetchMyRoster.mockImplementation(async (_client: unknown, teamId: string) => {
      if (teamId === academyOne.id) throw new Error("own roster unavailable");
      return { draftPlayers: [], riotAccounts: [] };
    });

    await expect(loadMyTeamDashboard(fakeClient() as never, "academy"))
      .rejects.toThrow("own roster unavailable");
  });

  it("throws explicit core query failures instead of returning an empty success state", async () => {
    await expect(loadMyTeamDashboard(
      fakeClient({ errors: { fixtures: { message: "fixtures unavailable" } } }) as never,
      "academy",
    )).rejects.toMatchObject({ message: "fixtures unavailable" });
  });
});
