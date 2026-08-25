import { describe, expect, it, vi } from "vitest";
import { activeOnly, fetchMyReports, fetchMyRoster, rosterKey, findDraftTeamId } from "./queries";
import type { LeagueTeam } from "@/lib/matches/types";

const team = (over: Partial<LeagueTeam>): LeagueTeam => ({
  id: "t",
  name: "Team",
  abbreviation: "T",
  active: true,
  ...over,
});

describe("activeOnly", () => {
  it("keeps active teams and drops retired ones", () => {
    const teams = [
      team({ id: "1", name: "Current", active: true }),
      team({ id: "2", name: "Retired", active: false }),
      team({ id: "3", name: "Also current", active: true }),
    ];
    expect(activeOnly(teams).map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("keeps a team whose active flag is missing (fail open, never hide a live team)", () => {
    const teams = [{ id: "9", name: "Legacy", abbreviation: "L" } as LeagueTeam];
    expect(activeOnly(teams)).toHaveLength(1);
  });

  it("returns an empty list unchanged", () => {
    expect(activeOnly([])).toEqual([]);
  });
});

describe("rosterKey", () => {
  it("joins name and tag unambiguously", () => {
    expect(rosterKey("Sunset Diner", "na1")).toBe("Sunset Diner#na1");
  });

  it("distinguishes same-name players on different tags", () => {
    expect(rosterKey("Aura", "5950")).not.toBe(rosterKey("Aura", "RGB0"));
  });

  it("contains no control characters", () => {
    // A previous version used a literal NUL byte, which made the source file
    // read as binary to grep and other tooling.
    expect(/[\u0000-\u001f]/.test(rosterKey("Ward Bot", "NA1"))).toBe(false);
  });
});

describe("findDraftTeamId", () => {
  it("finds an Academy team by normalized name when the Premier draft does not contain it", () => {
    expect(
      findDraftTeamId("academy wolves", [
        { id: "premier-1", name: "Premier Lions" },
        { id: "academy-1", name: "Academy Wolves" },
      ]),
    ).toBe("academy-1");
  });
});

type QueryResult = { data: unknown; error: { message: string } | null };

function rosterClient(failedTable: string) {
  const rows: Record<string, unknown> = {
    league_teams: { name: "Academy Wolves" },
    league_settings: { featured_draft_id: "premier-draft", academy_draft_id: "academy-draft" },
    teams: [{ id: "draft-team-1", name: "Academy Wolves" }],
    players: [{
      id: "draft-player-1",
      draft_id: "academy-draft",
      display_name: "Player One",
      role: "mid",
      rank: null,
      opgg_url: null,
      notes: null,
      canonical_player_id: "pool-1",
      team_id: "draft-team-1",
      price: 10,
      acquisition: "auction",
    }],
    player_pool: [{ id: "pool-1", display_name: "Player One", rank: null, opgg_url: null }],
    roster_memberships: [],
  };

  return {
    from: vi.fn((table: string) => {
      const result = (): QueryResult => failedTable === table
        ? { data: null, error: { message: `${table} unavailable` } }
        : { data: rows[table] ?? null, error: null };
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        single: vi.fn(async () => result()),
        then: (
          onFulfilled: (value: QueryResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(result()).then(onFulfilled, onRejected),
      };
      return chain;
    }),
  };
}

function collidingRosterClient() {
  const tables: Record<string, Record<string, unknown>[]> = {
    league_teams: [{ id: "league-team", name: "Shared Team" }],
    league_settings: [{
      id: 1,
      featured_draft_id: "premier-draft",
      academy_draft_id: "academy-draft",
    }],
    teams: [
      { id: "premier-team", draft_id: "premier-draft", name: "Shared Team" },
      { id: "academy-team", draft_id: "academy-draft", name: "Shared Team" },
    ],
    players: [
      {
        id: "premier-player",
        draft_id: "premier-draft",
        display_name: "Premier Player",
        role: "mid",
        rank: null,
        opgg_url: null,
        notes: null,
        canonical_player_id: "premier-pool",
        team_id: "premier-team",
        price: 10,
        acquisition: "auction",
      },
      {
        id: "academy-player",
        draft_id: "academy-draft",
        display_name: "Academy Player",
        role: "mid",
        rank: null,
        opgg_url: null,
        notes: null,
        canonical_player_id: "academy-pool",
        team_id: "academy-team",
        price: 8,
        acquisition: "auction",
      },
    ],
    player_pool: [],
    roster_memberships: [],
  };

  return {
    from: vi.fn((table: string) => {
      let rows = [...(tables[table] ?? [])];
      const response = () => ({ data: rows, error: null });
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return chain;
        }),
        in: vi.fn((column: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[column]));
          return chain;
        }),
        order: vi.fn(() => chain),
        single: vi.fn(async () => ({ data: rows[0] ?? null, error: null })),
        then: (
          onFulfilled: (value: ReturnType<typeof response>) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(response()).then(onFulfilled, onRejected),
      };
      return chain;
    }),
  };
}

describe("fetchMyRoster", () => {
  it.each([
    "league_teams",
    "league_settings",
    "teams",
    "player_pool",
  ])("propagates an explicit %s read failure", async (table) => {
    await expect(fetchMyRoster(
      rosterClient(table) as never,
      "league-team-1",
      "A1",
      "academy",
    )).rejects.toMatchObject({ message: `${table} unavailable` });
  });

  it.each([
    ["premier", "Premier Player"],
    ["academy", "Academy Player"],
  ] as const)("selects only the %s draft when both leagues use the same team name", async (league, playerName) => {
    const roster = await fetchMyRoster(
      collidingRosterClient() as never,
      "league-team",
      league === "academy" ? "A1" : "S5",
      league,
    );

    expect(roster.draftPlayers.map((player) => player.display_name)).toEqual([playerName]);
  });
});

describe("fetchMyReports", () => {
  it("excludes a report whose opponent is outside the selected league", async () => {
    const reports = [
      {
        id: "academy-report",
        season: "A1",
        season_phase: "Regular",
        team_a_id: "academy-a",
        team_b_id: "academy-b",
        score_a: 2,
        score_b: 0,
        draft_url: null,
        submitted_by: "captain",
        submitted_at: "2026-08-02T00:00:00Z",
        status: "complete",
        error_text: null,
        warning_text: null,
        ingested_at: "2026-08-02T00:00:00Z",
        fixture_id: "fixture-academy",
      },
      {
        id: "mixed-report",
        season: "A1",
        season_phase: "Regular",
        team_a_id: "academy-a",
        team_b_id: "premier-a",
        score_a: 2,
        score_b: 1,
        draft_url: null,
        submitted_by: "captain",
        submitted_at: "2026-08-01T00:00:00Z",
        status: "complete",
        error_text: null,
        warning_text: null,
        ingested_at: "2026-08-01T00:00:00Z",
        fixture_id: "fixture-mixed",
      },
    ];
    const games = [
      { id: "game-academy", report_id: "academy-report", game_number: 1, match_id: "NA1_1", blue_team_id: "academy-a", resolved_blue_team_id: "academy-a", status: "complete", error_text: null },
      { id: "game-mixed", report_id: "mixed-report", game_number: 1, match_id: "NA1_2", blue_team_id: "academy-a", resolved_blue_team_id: "academy-a", status: "complete", error_text: null },
    ];
    let selectedReportIds: string[] = [];
    const from = vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        or: vi.fn(() => chain),
        in: vi.fn((_column: string, ids: string[]) => {
          selectedReportIds = ids;
          return chain;
        }),
        order: vi.fn(() => chain),
        then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(resolve({
          data: table === "match_reports"
            ? reports
            : games.filter((game) => selectedReportIds.includes(game.report_id)),
          error: null,
        })),
      };
      return chain;
    });

    const result = await fetchMyReports(
      { from } as never,
      "academy-a",
      "A1",
      [
        team({ id: "academy-a", name: "Academy A" }),
        team({ id: "academy-b", name: "Academy B" }),
      ],
    );

    expect(result.map((report) => report.id)).toEqual(["academy-report"]);
    expect(result[0].games.map((game) => game.id)).toEqual(["game-academy"]);
  });
});
