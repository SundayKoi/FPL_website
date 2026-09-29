import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomepageSchedule, selectFutureHomepageFixtures, selectHomepageFeaturedFixture, selectHomepageStage } from "./schedule";
import type { FixtureRow } from "@/lib/schedule/types";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "week_1",
    division: "Solari",
    team_a: "Alpha",
    team_b: "Bravo",
    scheduled_at: "2026-08-17T00:00:00Z",
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

function query(result: unknown) {
  const builder = {
    select: () => builder,
    order: () => builder,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

afterEach(() => {
  createServerSupabase.mockReset();
});

describe("fetchHomepageSchedule", () => {
  it("selects the newest season and its first incomplete week", async () => {
    const from = vi.fn(() =>
      query({
        data: [
          fixture({ id: "old", season: "S4", stage: "week_1" }),
          fixture({ id: "week-1", stage: "week_1" }),
          fixture({ id: "week-2", stage: "week_2" }),
        ],
        error: null,
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageSchedule()).resolves.toMatchObject({
      season: "S5",
      activeStage: "week_1",
      fixtures: [expect.objectContaining({ id: "week-1" })],
      upcoming: [expect.objectContaining({ id: "week-1" }), expect.objectContaining({ id: "week-2" })],
    });
  });

  it("lists the active stage's fixtures and the rest of the bracket during the playoffs", async () => {
    const played = (["week_1", "week_2", "week_3", "week_4", "week_5"] as const).map((stage, index) =>
      fixture({ id: stage, stage, score_a: 2, score_b: 1, sort_order: index }),
    );
    const from = vi.fn(() =>
      query({
        data: [
          ...played,
          // Deliberately out of bracket order: `upcoming` re-sorts.
          fixture({ id: "finals", stage: "finals", team_a: null, team_b: null }),
          fixture({ id: "semi-1", stage: "semifinals", sort_order: 0 }),
          fixture({ id: "semi-2", stage: "semifinals", sort_order: 1, team_b: null }),
          fixture({ id: "quarter", stage: "quarterfinals", score_a: 3, score_b: 0 }),
        ],
        error: null,
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    const schedule = await fetchHomepageSchedule();

    expect(schedule.activeStage).toBe("semifinals");
    expect(schedule.fixtures.map((row) => row.id)).toEqual(["semi-1", "semi-2"]);
    // Bracket order, then sort_order — the semifinals the league is at, then
    // everything still to come.
    expect(schedule.upcoming.map((row) => row.id)).toEqual(["semi-1", "semi-2", "finals"]);
  });

  it("lists the weeks from the active week on mid-season", async () => {
    const from = vi.fn(() =>
      query({
        data: [
          fixture({ id: "week-1", stage: "week_1", score_a: 2, score_b: 1 }),
          fixture({ id: "week-2", stage: "week_2" }),
          fixture({ id: "week-3", stage: "week_3" }),
        ],
        error: null,
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    const schedule = await fetchHomepageSchedule();

    expect(schedule.activeStage).toBe("week_2");
    expect(schedule.fixtures.map((row) => row.id)).toEqual(["week-2"]);
    expect(schedule.upcoming.map((row) => row.id)).toEqual(["week-2", "week-3"]);
  });

  it("leaves upcoming empty once the whole season is played", async () => {
    const played = [
      ...(["week_1", "week_2", "week_3", "week_4", "week_5"] as const).map((stage) =>
        fixture({ id: stage, stage, score_a: 2, score_b: 1 }),
      ),
      fixture({ id: "finals", stage: "finals", score_a: 3, score_b: 2 }),
    ];
    createServerSupabase.mockResolvedValue({ from: vi.fn(() => query({ data: played, error: null })) });

    await expect(fetchHomepageSchedule()).resolves.toMatchObject({
      activeStage: null,
      fixtures: [],
      upcoming: [],
    });
  });

  it("keeps Week 2 active when Week 1 is complete but Week 2 is empty", async () => {
    const from = vi.fn(() =>
      query({
        data: [fixture({ id: "week-1", score_a: 2, score_b: 1 })],
        error: null,
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageSchedule()).resolves.toMatchObject({
      season: "S5",
      activeStage: "week_2",
      fixtures: [],
      upcoming: [],
    });
  });

  it("starts at Week 1 when there are no fixtures", async () => {
    createServerSupabase.mockResolvedValue({ from: vi.fn(() => query({ data: [], error: null })) });

    await expect(fetchHomepageSchedule()).resolves.toEqual(expect.objectContaining({
      season: null,
      isNewestSeason: true,
      activeStage: "week_1",
      fixtures: [],
      upcoming: [],
    }));
  });

  it("keeps an explicitly selected season even if it has no fixtures yet", async () => {
    createServerSupabase.mockResolvedValue({ from: vi.fn(() => query({ data: [fixture({ season: "S5" })], error: null })) });
    await expect(fetchHomepageSchedule(undefined, "S6")).resolves.toMatchObject({ season: "S6", fixtures: [] });
  });
});

describe("selectHomepageStage", () => {
  it("advances from the completed regular season into the playoffs", () => {
    const regular = (["week_1", "week_2", "week_3", "week_4", "week_5"] as const).map((stage) =>
      fixture({ id: stage, stage, score_a: 2, score_b: 1 }),
    );
    expect(selectHomepageStage([...regular, fixture({ id: "qf", stage: "quarterfinals" })])).toBe("quarterfinals");
  });

  it("does not let empty regular-season stages hide a playoffs-only schedule", () => {
    expect(selectHomepageStage([fixture({ id: "qf", stage: "quarterfinals" })])).toBe("quarterfinals");
  });
});

describe("selectHomepageFeaturedFixture", () => {
  const fixtures = [
    fixture({ id: "first-fixture", team_a: "Alpha", team_b: "Bravo" }),
    fixture({ id: "configured-fixture", team_a: "Charlie", team_b: "Delta" }),
  ];

  it("selects a configured fixture from the scoped homepage schedule", () => {
    expect(selectHomepageFeaturedFixture(fixtures, "configured-fixture")).toEqual(
      fixtures[1],
    );
  });

  it("falls back to the first scoped fixture when the configured fixture is absent", () => {
    expect(selectHomepageFeaturedFixture(fixtures, "fixture-from-another-schedule")).toEqual(
      fixtures[0],
    );
  });

  it("honors a configured later-stage fixture only within the scoped candidate set", () => {
    const later = fixture({ id: "later", stage: "quarterfinals", season: "S5" });
    expect(selectHomepageFeaturedFixture(fixtures, "later", [...fixtures, later])).toEqual(later);
    expect(selectHomepageFeaturedFixture(fixtures, "academy", [...fixtures, later])).toEqual(fixtures[0]);
  });

  it("can keep a reported featured result after the active stage is complete", () => {
    const reported = fixture({ id: "reported", score_a: 2, score_b: 1 });
    expect(selectHomepageFeaturedFixture([], "reported", [reported])).toEqual(reported);
  });
});

describe("selectFutureHomepageFixtures", () => {
  it("excludes results and elapsed fixtures, orders by kickoff, and puts undated slots last", () => {
    const rows = [
      fixture({ id: "undated", scheduled_at: null }),
      fixture({ id: "late", scheduled_at: "2026-10-10T00:00:00Z" }),
      fixture({ id: "reported", scheduled_at: "2026-10-05T00:00:00Z", score_a: 2, score_b: 0 }),
      fixture({ id: "past", scheduled_at: "2026-09-01T00:00:00Z" }),
      fixture({ id: "early", scheduled_at: "2026-10-05T00:00:00Z" }),
    ];
    expect(selectFutureHomepageFixtures(rows, Date.parse("2026-09-26T00:00:00Z")).map((row) => row.id)).toEqual(["early", "late", "undated"]);
    expect(rows[0].id).toBe("undated");
  });
});
