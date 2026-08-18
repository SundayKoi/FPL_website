import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveSeriesStandings, fetchHomepageStandings } from "./standings";

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
    await expect(fetchHomepageStandings()).resolves.toEqual([
      { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 1, losses: 0, winrate_pct: 100 },
      { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2, wins: 0, losses: 1, winrate_pct: 0 },
    ]);
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

    await expect(fetchHomepageStandings()).resolves.toEqual([
      { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 0, losses: 0, winrate_pct: 0 },
    ]);
  });

  it("returns no rows when no draft is featured", async () => {
    const from = vi.fn(() => query({ data: { featured_draft_id: null }, error: null }));
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([]);
  });

  it("returns no rows when local settings have not been seeded", async () => {
    const from = vi.fn(() =>
      query({
        data: null,
        error: { code: "PGRST116", message: "The result contains 0 rows" },
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([]);
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
