import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSeriesStandings, deriveStandingsRace, deriveTeamExtras, fetchHomepageStandings } from "./standings";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

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

const draftTeams = [
  { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1 },
  { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2 },
];

afterEach(() => {
  createServerSupabase.mockReset();
});

describe("fetchHomepageStandings", () => {
  it("builds series records from the season's fixtures", async () => {
    const from = vi.fn((table: string) =>
      table === "league_settings"
        ? query({ data: { featured_draft_id: "draft-s5" }, error: null })
        : table === "fixtures"
          ? query({
              data: [{ season: "S5", team_a: "Alpha", team_b: "Bravo", score_a: 2, score_b: 1 }],
              error: null,
            })
          : query({ data: draftTeams, error: null }),
    );
    createServerSupabase.mockResolvedValue({ from });

    // 2-1 is ONE series win, not two wins and a loss.
    await expect(fetchHomepageStandings()).resolves.toEqual({
      teams: [
        { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 1, losses: 0, winrate_pct: 100, form: ["W"], next_opponent: null },
        { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2, wins: 0, losses: 1, winrate_pct: 0, form: ["L"], next_opponent: null },
      ],
      race: [],
    });
  });

  it("ignores fixtures from another season", async () => {
    const from = vi.fn((table: string) =>
      table === "league_settings"
        ? query({ data: { featured_draft_id: "draft-s5" }, error: null })
        : table === "fixtures"
          ? query({ data: [{ season: "S4", team_a: "Alpha", team_b: "Bravo", score_a: 2, score_b: 0 }], error: null })
          : query({ data: [draftTeams[0]], error: null }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual({
      teams: [
        { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 0, losses: 0, winrate_pct: 0, form: [], next_opponent: null },
      ],
      race: [],
    });
  });

  it("returns no rows when no draft is featured", async () => {
    const from = vi.fn(() => query({ data: { featured_draft_id: null }, error: null }));
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual({ teams: [], race: [] });
  });

  it("returns no rows when local settings have not been seeded", async () => {
    const from = vi.fn(() =>
      query({
        data: null,
        error: { code: "PGRST116", message: "The result contains 0 rows" },
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual({ teams: [], race: [] });
  });
});

describe("deriveTeamExtras", () => {
  const staged = (a: string, b: string, sa: number | null, sb: number | null, stage: string, sort: number) => ({
    season: "S5", team_a: a, team_b: b, score_a: sa, score_b: sb, stage: stage as never, sort_order: sort,
  });

  it("returns chronological form and the next unplayed opponent", () => {
    const extras = deriveTeamExtras(
      [
        staged("Alpha", "Bravo", 0, 2, "week_2", 1),
        staged("Alpha", "Bravo", 2, 1, "week_1", 1),
        staged("Alpha", "Charlie", null, null, "week_3", 1),
      ],
      "S5",
      "Alpha",
    );

    expect(extras.form).toEqual(["W", "L"]);
    expect(extras.next_opponent).toBe("Charlie");
  });

  it("caps form at the five most recent series", () => {
    const fixtures = ["week_1", "week_2", "week_3", "week_4", "week_5", "gauntlet_r1"].map((stage, index) =>
      staged("Alpha", "Bravo", index === 0 ? 0 : 2, index === 0 ? 2 : 0, stage, 1),
    );
    const extras = deriveTeamExtras(fixtures, "S5", "Alpha");

    expect(extras.form).toEqual(["W", "W", "W", "W", "W"]);
  });
});

describe("deriveStandingsRace", () => {
  const staged = (a: string, b: string, sa: number | null, sb: number | null, stage: string) => ({
    season: "S5", team_a: a, team_b: b, score_a: sa, score_b: sb, stage: stage as never, sort_order: 1,
  });

  it("emits one cumulative frame per stage with a completed series", () => {
    const race = deriveStandingsRace(
      [
        staged("Alpha", "Bravo", 2, 0, "week_1"),
        staged("Bravo", "Alpha", 2, 1, "week_2"),
        staged("Alpha", "Bravo", null, null, "week_3"),
      ],
      "S5",
      draftTeams,
    );

    expect(race.map((frame) => frame.stage)).toEqual(["week_1", "week_2"]);
    const week1 = Object.fromEntries(race[0].entries.map((entry) => [entry.name, entry]));
    expect(week1.Alpha).toMatchObject({ wins: 1, losses: 0 });
    const week2 = Object.fromEntries(race[1].entries.map((entry) => [entry.name, entry]));
    expect(week2.Alpha).toMatchObject({ wins: 1, losses: 1 });
    expect(week2.Bravo).toMatchObject({ wins: 1, losses: 1 });
  });

  it("returns no frames when nothing has been played", () => {
    expect(deriveStandingsRace([staged("Alpha", "Bravo", null, null, "week_1")], "S5", draftTeams)).toEqual([]);
  });
});

describe("deriveSeriesStandings", () => {
  const teams = [
    { id: "t1", name: "Endless", abbreviation: "END", nomination_position: 1 },
    { id: "t2", name: "Alcatraz", abbreviation: "ALC", nomination_position: 2 },
    { id: "t3", name: "Wildcats", abbreviation: "WIL", nomination_position: 3 },
  ];
  const fx = (a: string, b: string, sa: number | null, sb: number | null, season = "S5") => ({
    season, team_a: a, team_b: b, score_a: sa, score_b: sb,
  });

  // The point of the change: the homepage used to derive standings from
  // raw_stats, which counts individual games, so a team that had played one
  // Bo3 and won it 2-1 showed as "2-1" -- a win and its margin in the same
  // column, and three matches where one had been played.
  it("counts a series as one result regardless of its scoreline", () => {
    const standings = deriveSeriesStandings(
      [fx("Alcatraz", "Wildcats", 2, 1), fx("Endless", "Alcatraz", 2, 0)],
      "S5",
      teams,
    );
    const byName = Object.fromEntries(standings.map((t) => [t.name, t]));
    expect(byName.Alcatraz).toMatchObject({ wins: 1, losses: 1 });
    expect(byName.Wildcats).toMatchObject({ wins: 0, losses: 1 });
    expect(byName.Endless).toMatchObject({ wins: 1, losses: 0 });
  });

  it("keeps a team that has not played, at 0-0", () => {
    const standings = deriveSeriesStandings([fx("Endless", "Alcatraz", 2, 0)], "S5", teams);
    expect(standings.find((t) => t.name === "Wildcats")).toMatchObject({ wins: 0, losses: 0, winrate_pct: 0 });
  });

  it("ignores unplayed fixtures and other seasons", () => {
    const standings = deriveSeriesStandings(
      [fx("Endless", "Alcatraz", null, null), fx("Endless", "Wildcats", 2, 0, "S4")],
      "S5",
      teams,
    );
    expect(standings.every((t) => t.wins === 0 && t.losses === 0)).toBe(true);
  });

  it("matches team names case- and whitespace-insensitively", () => {
    const standings = deriveSeriesStandings([fx("  endless ", "ALCATRAZ", 2, 1)], "S5", teams);
    expect(standings.find((t) => t.name === "Endless")?.wins).toBe(1);
    expect(standings.find((t) => t.name === "Alcatraz")?.losses).toBe(1);
  });

  it("orders by series wins, then fewest losses", () => {
    const standings = deriveSeriesStandings(
      [fx("Endless", "Wildcats", 2, 0), fx("Alcatraz", "Wildcats", 2, 1), fx("Endless", "Alcatraz", 2, 1)],
      "S5",
      teams,
    );
    expect(standings.map((t) => t.name)).toEqual(["Endless", "Alcatraz", "Wildcats"]);
    expect(standings[0].winrate_pct).toBe(100);
  });
});
