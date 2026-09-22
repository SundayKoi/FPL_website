import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "./schedule";
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

    await expect(fetchHomepageSchedule()).resolves.toEqual({
      season: null,
      isNewestSeason: true,
      activeStage: "week_1",
      fixtures: [],
      upcoming: [],
    });
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
});
