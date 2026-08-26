import { describe, expect, it, vi } from "vitest";
import {
  fetchIngestedScoutingGames,
  fetchInhousePlayerStats,
  fetchScoutingHistory,
  INGESTED_SCOUTING_COLUMNS,
} from "./queries";
import type { SupabaseClient } from "@supabase/supabase-js";

const fixture = (id: string, teamA: string | null, teamB: string | null) => ({
  id, season: "S5", stage: "week_1", team_a: teamA, team_b: teamB,
  scheduled_at: "2026-08-01T00:00:00Z", best_of: 3, score_a: 2, score_b: 1,
});

function builder(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
  };
  return query;
}

describe("fetchScoutingHistory", () => {
  it("loads compact active-league rows and maps nullable draft JSON safely", async () => {
    const rawActions = [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }];
    const fixtureQuery = builder([
      fixture("premier-fixture", "Night Vale", "Other"),
      fixture("cross-league", "Night Vale", "Academy Wolves"),
    ]);
    const draftQuery = builder([
      { id: "draft-1", fixture_id: "premier-fixture", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: null, actions: rawActions, positions: null, created_at: "2026-08-01" },
      { id: "draft-cross", fixture_id: "cross-league", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Academy Wolves", winner_team: null, actions: null, positions: null, created_at: "2026-08-01" },
    ]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: [" night vale ", "Other"],
    });

    expect(from).toHaveBeenCalledWith("fixtures");
    expect(from).toHaveBeenCalledWith("match_drafts");
    expect(fixtureQuery.select).toHaveBeenCalledWith("id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b");
    expect(draftQuery.select).toHaveBeenCalledWith("id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, actions, positions, created_at");
    expect(history.fixtures.map((row) => row.id)).toEqual(["premier-fixture"]);
    expect(history.drafts[0].actions).toEqual(rawActions);
    expect(history.drafts).toHaveLength(1);
    expect(history.drafts[0].positions).toBeNull();
  });

  it("excludes mixed-league fixtures from Academy history and throws either PostgREST error", async () => {
    const rows = [
      fixture("academy", "Academy Wolves", "Academy Owls"),
      fixture("mixed", "Academy Wolves", "Premier Lions"),
      fixture("none", "Premier Lions", "Other"),
    ];
    const from = vi.fn((table: string) => table === "fixtures" ? builder(rows) : builder([]));
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "academy",
      leagueTeamNames: new Set(["academy wolves", "academy owls"]),
    });
    expect(history.fixtures.map((row) => row.id)).toEqual(["academy"]);

    const fixtureError = new Error("fixture failed");
    await expect(fetchScoutingHistory({ from: vi.fn((table: string) => table === "fixtures" ? builder([], fixtureError) : builder([])) } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: [] })).rejects.toThrow("fixture failed");
    const draftError = new Error("draft failed");
    await expect(fetchScoutingHistory({ from: vi.fn((table: string) => table === "fixtures" ? builder([], null) : builder([], draftError)) } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: [] })).rejects.toThrow("draft failed");
  });

  it("drops malformed nested actions and normalizes invalid position sides", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([{
      id: "d", fixture_id: "f", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other",
      winner_team: null,
      actions: [
        { stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" },
        null, "not an action", { kind: "pick", champion: 42 }, { kind: "unknown", champion: "Lux" },
        { stepIndex: "bad", kind: "pick", champion: "Lux" },
      ],
      positions: { blue: ["Ahri", null], red: ["bad", 42] },
      created_at: "2026-08-01",
    }]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: ["Night Vale", "Other"] });
    expect(history.drafts[0].actions).toEqual([{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }]);
    expect(history.drafts[0].positions).toEqual({ blue: ["Ahri", null] });
  });

  it("falls back to fixture teams when a draft has no recorded side names", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([{
      id: "d", fixture_id: "f", game_number: 1, blue_team_name: null, red_team_name: null,
      winner_team: null, actions: [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }], positions: null, created_at: "2026-08-01",
    }]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: ["Night Vale", "Other"],
    });

    expect(history.drafts[0].blue_team_name).toBe("Night Vale");
    expect(history.drafts[0].red_team_name).toBe("Other");
  });

  it("retains Premier history for an explicitly scoped unmatched featured team", async () => {
    const fixtureQuery = builder([
      fixture("featured", "Alpha", "Featured Outsider"),
      fixture("outside-scope", "Featured Outsider", "Unrelated"),
    ]);
    const draftQuery = builder([
      {
        id: "featured-draft", fixture_id: "featured", game_number: 1,
        blue_team_name: "Alpha", red_team_name: "Featured Outsider", winner_team: null,
        actions: [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }],
        positions: null, created_at: "2026-08-01",
      },
      {
        id: "outside-draft", fixture_id: "outside-scope", game_number: 1,
        blue_team_name: "Featured Outsider", red_team_name: "Unrelated", winner_team: null,
        actions: [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Lux" }],
        positions: null, created_at: "2026-08-01",
      },
    ]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier",
      leagueTeamNames: ["Alpha", "Beta", "Featured Outsider"],
    });

    expect(history.fixtures.map((row) => row.id)).toEqual(["featured"]);
    expect(history.drafts.map((row) => row.id)).toEqual(["featured-draft"]);
  });

  it("loads completed historical drafts from the Drafter URL stored on a match report", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([]);
    const leagueTeamsQuery = builder([
      { id: "team-a", name: "Other" },
      { id: "team-b", name: "Night Vale" },
    ]);
    const reportQuery = builder([{ id: "report-1", fixture_id: "f", draft_url: "https://drafter.lol/draft/series-1", team_a_id: "team-a", team_b_id: "team-b" }]);
    const reportGamesQuery = builder([{ report_id: "report-1", game_number: 1, blue_team_id: "team-b" }]);
    const html = `<script>self.__next_f.push([1,"1d:[\\\"$\\\",null,{\\\"drafts\\\":[{\\\"id\\\":42,\\\"done\\\":true,\\\"blueBan1\\\":\\\"Annie\\\",\\\"redBan1\\\":\\\"Viktor\\\",\\\"bluePick1\\\":\\\"Morgana\\\",\\\"redPick1\\\":\\\"Jhin\\\"}]}]"])</script>`;
    const from = vi.fn((table: string) => ({
      fixtures: fixtureQuery,
      match_drafts: draftQuery,
      league_teams: leagueTeamsQuery,
      match_reports: reportQuery,
      match_report_games: reportGamesQuery,
    }[table] ?? builder([])));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => html })));

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: ["Night Vale", "Other"],
    });

    expect(history.drafts).toHaveLength(1);
    expect(history.drafts[0].blue_team_name).toBe("Night Vale");
    expect(history.drafts[0].red_team_name).toBe("Other");
    expect(history.drafts[0].actions.some((action) => action.champion === "Morgana")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("loads every reported game when a Drafter URL defaults to one selected game", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([]);
    const leagueTeamsQuery = builder([
      { id: "team-a", name: "Other" },
      { id: "team-b", name: "Night Vale" },
    ]);
    const reportQuery = builder([{ id: "report-1", fixture_id: "f", draft_url: "https://drafter.lol/draft/series-1", team_a_id: "team-a", team_b_id: "team-b" }]);
    const reportGamesQuery = builder([
      { report_id: "report-1", game_number: 1, blue_team_id: "team-b" },
      { report_id: "report-1", game_number: 2, blue_team_id: "team-a" },
      { report_id: "report-1", game_number: 3, blue_team_id: "team-b" },
    ]);
    const from = vi.fn((table: string) => ({
      fixtures: fixtureQuery,
      match_drafts: draftQuery,
      league_teams: leagueTeamsQuery,
      match_reports: reportQuery,
      match_report_games: reportGamesQuery,
    }[table] ?? builder([])));
    const fetchMock = vi.fn(async (request: string) => {
      const game = new URL(request).searchParams.get("game") ?? "1";
      const html = `<script>self.__next_f.push([1,"1d:[\\\"$\\\",null,{\\\"drafts\\\":[{\\\"done\\\":true,\\\"bluePick1\\\":\\\"Game ${game}\\\"}]}]"])</script>`;
      return { ok: true, text: async () => html };
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: ["Night Vale", "Other"],
    });

    expect(history.drafts).toHaveLength(3);
    expect(history.drafts.map((draft) => draft.game_number)).toEqual([1, 2, 3]);
    expect(history.drafts[1]).toMatchObject({ blue_team_name: "Other", red_team_name: "Night Vale" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([request]) => request)).toEqual([
      "https://drafter.lol/draft/series-1?game=1",
      "https://drafter.lol/draft/series-1?game=2",
      "https://drafter.lol/draft/series-1?game=3",
    ]);
    vi.unstubAllGlobals();
  });

  it("matches an older report without fixture_id to its scheduled series", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([]);
    const leagueTeamsQuery = builder([
      { id: "team-a", name: "Other" },
      { id: "team-b", name: "Night Vale" },
    ]);
    const reportQuery = builder([{
      id: "report-1",
      fixture_id: null,
      season: "S5",
      draft_url: "https://drafter.lol/draft/series-1",
      team_a_id: "team-a",
      team_b_id: "team-b",
    }]);
    const reportGamesQuery = builder([{ report_id: "report-1", game_number: 1, blue_team_id: "team-b" }]);
    const from = vi.fn((table: string) => ({
      fixtures: fixtureQuery,
      match_drafts: draftQuery,
      league_teams: leagueTeamsQuery,
      match_reports: reportQuery,
      match_report_games: reportGamesQuery,
    }[table] ?? builder([])));
    const html = `<script>self.__next_f.push([1,"1d:[\\\"$\\\",null,{\\\"drafts\\\":[{\\\"done\\\":true,\\\"bluePick1\\\":\\\"Ahri\\\"}]}]"])</script>`;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => html })));

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: ["Night Vale", "Other"],
    });

    expect(history.drafts).toHaveLength(1);
    expect(history.drafts[0]).toMatchObject({ fixture_id: "f", game_number: 1, blue_team_name: "Night Vale" });
    vi.unstubAllGlobals();
  });

  it("loads history rows beyond the first Supabase page", async () => {
    const targetFixture = fixture("target", "Night Vale", "Other");
    const pages = new Map<string, unknown[]>([
      ["fixtures:0", Array.from({ length: 1000 }, (_, index) => fixture(`unrelated-${index}`, "Nope", "Other Nope"))],
      ["fixtures:1000", [targetFixture]],
      ["match_drafts:0", Array.from({ length: 1000 }, (_, index) => ({
        id: `draft-unrelated-${index}`, fixture_id: `unrelated-${index}`, game_number: 1, blue_team_name: "Nope", red_team_name: "Other Nope",
        winner_team: null, actions: [], positions: null, created_at: "2026-08-01",
      }))],
      ["match_drafts:1000", [{
        id: "draft-target", fixture_id: "target", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other",
        winner_team: null, actions: [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }], positions: null, created_at: "2026-08-01",
      }]],
      ["league_teams:0", []],
      ["match_reports:0", []],
      ["match_report_games:0", []],
    ]);
    const queries = new Map<string, ReturnType<typeof builder>>();
    const from = vi.fn((table: string) => {
      const query = queries.get(table) ?? (() => {
        let offset = 0;
        const query = {
          select: vi.fn(() => query),
          order: vi.fn(() => query),
          range: vi.fn((fromOffset: number) => { offset = fromOffset; return query; }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
            data: pages.get(`${table}:${offset}`) ?? [], error: null,
          })),
        };
        return query;
      })();
      queries.set(table, query);
      return query;
    });

    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: ["Night Vale", "Other"],
    });

    expect(history.fixtures.map((row) => row.id)).toEqual(["target"]);
    expect(history.drafts.map((row) => row.id)).toEqual(["draft-target"]);
  });
});

describe("fetchInhousePlayerStats", () => {
  it("loads every page from the in-house table", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      summoner_name: "Lizzo Mukkbang", champion: "Ahri", kills: index, deaths: 1, assists: 1, win: true,
    }));
    const secondPage = [{ summoner_name: "Lizzo Mukkbang", champion: "Ahri", kills: 1, deaths: 1, assists: 1, win: false }];
    let pageIndex = 0;
    const query = {
      select: vi.fn(() => query),
      range: vi.fn((offset: number) => { pageIndex = offset === 0 ? 0 : 1; return query; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [firstPage, secondPage][pageIndex], error: null })),
    };
    const from = vi.fn(() => query);

    const result = await fetchInhousePlayerStats({ from } as unknown as SupabaseClient, [{ id: "lizzo", displayName: "Lizzo Mukkbang", role: "jungle" }]);

    expect(result[0].games).toBe(1001);
    expect(query.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(query.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});

describe("fetchIngestedScoutingGames", () => {
  it("reads paged raw_stats rows and maps them to the current roster", async () => {
    let pageIndex = 0;
    const rawStatsQuery = {
      select: vi.fn(() => rawStatsQuery),
      order: vi.fn(() => rawStatsQuery),
      range: vi.fn((offset: number) => { pageIndex = offset === 0 ? 0 : 1; return rawStatsQuery; }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
        data: pageIndex === 0
          ? Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, match_id: `unknown-${index}`, game_date: null, season: "S5", summoner_name: "Unknown", tag: "NA1", champion: "Ahri" }))
          : [{ id: 1001, match_id: "NA1_ingested_1", game_date: "2026-08-01T00:00:00Z", season: "S5", summoner_name: "Northstar", tag: "NA1", champion: "Orianna" }],
        error: null,
      })),
    };
    const reportGamesQuery = {
      select: vi.fn(() => reportGamesQuery),
      order: vi.fn(() => reportGamesQuery),
      range: vi.fn(() => reportGamesQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: "game-1", match_id: "NA1_ingested_1", report_id: "report-1" }], error: null })),
    };
    const reportsQuery = {
      select: vi.fn(() => reportsQuery),
      order: vi.fn(() => reportsQuery),
      range: vi.fn(() => reportsQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: "report-1", fixture_id: "fixture-1" }], error: null })),
    };
    const from = vi.fn((table: string) => table === "raw_stats" ? rawStatsQuery : table === "match_report_games" ? reportGamesQuery : reportsQuery);

    const result = await fetchIngestedScoutingGames(
      { from } as unknown as SupabaseClient,
      [{ id: "n", displayName: "Northstar", role: "mid", opggUrl: "https://op.gg/lol/summoners/na/Northstar-NA1" }],
    );

    expect(from).toHaveBeenCalledWith("raw_stats");
    expect(rawStatsQuery.select).toHaveBeenCalledWith(INGESTED_SCOUTING_COLUMNS);
    expect(rawStatsQuery.order).toHaveBeenCalledWith("id");
    expect(rawStatsQuery.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(rawStatsQuery.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(result).toEqual([{
      playerId: "n",
      playerName: "Northstar",
      role: "mid",
      champion: "Orianna",
      fixtureId: "fixture-1",
      season: "S5",
      matchId: "NA1_ingested_1",
      gameDate: "2026-08-01T00:00:00Z",
    }]);
  });

  it("maps an unlinked report game to its unique fixture for outcome attribution", async () => {
    const rawStatsQuery = builder([{
      id: 1, match_id: "match-1", game_date: "2026-08-01T00:00:00Z", season: "S5",
      summoner_name: "Northstar", tag: "NA1", champion: "Ahri", team_side: "Blue", win: true,
    }]);
    const reportGamesQuery = builder([{ id: "game-1", match_id: "match-1", report_id: "report-1", game_number: 1 }]);
    const reportsQuery = builder([{
      id: "report-1", fixture_id: null, season: "S5", team_a_id: "team-a", team_b_id: "team-b", draft_url: null,
    }]);
    const teamsQuery = builder([{ id: "team-a", name: "Night Vale" }, { id: "team-b", name: "Other" }]);
    const from = vi.fn((table: string) => ({
      raw_stats: rawStatsQuery,
      match_report_games: reportGamesQuery,
      match_reports: reportsQuery,
      league_teams: teamsQuery,
    }[table] ?? builder([])));

    const result = await fetchIngestedScoutingGames(
      { from } as unknown as SupabaseClient,
      [{ id: "n", displayName: "Northstar", role: "mid" }],
      [{ ...fixture("fixture-1", "Night Vale", "Other"), stage: "week_1" as const, best_of: 3 as const }],
    );

    expect(result[0]).toMatchObject({ fixtureId: "fixture-1", gameNumber: 1, teamSide: "blue", win: true });
  });
});
