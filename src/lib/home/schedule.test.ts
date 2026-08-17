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
    });
  });

  it("starts at Week 1 when there are no fixtures", async () => {
    createServerSupabase.mockResolvedValue({ from: vi.fn(() => query({ data: [], error: null })) });

    await expect(fetchHomepageSchedule()).resolves.toEqual({
      season: null,
      isNewestSeason: true,
      activeStage: "week_1",
      fixtures: [],
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
