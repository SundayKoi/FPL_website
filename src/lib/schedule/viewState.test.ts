import { describe, expect, it } from "vitest";
import { legacyScheduleHashView, resolveScheduleViewState, scheduleViewHref, stageViewHref } from "./viewState";
import type { FixtureRow } from "./types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "week_1",
    division: null,
    team_a: "A",
    team_b: "B",
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

const NOW = new Date("2026-09-27T12:00:00Z");

describe("schedule view state", () => {
  it("honors valid query state, taking the first repeated value", () => {
    const rows = [fixture({ stage: "week_4" })];
    expect(resolveScheduleViewState(rows, { phase: ["regular", "playoffs"], week: ["4", "2"] }, "premier", NOW)).toMatchObject({
      phase: "regular",
      week: 4,
      season: "S5",
    });
  });

  it("uses a valid week without a phase and safely ignores invalid weeks", () => {
    const rows = [fixture({ stage: "week_3" })];
    expect(resolveScheduleViewState(rows, { week: "5" }, "premier", NOW).week).toBe(5);
    expect(resolveScheduleViewState(rows, { phase: "regular", week: "99" }, "premier", NOW).week).toBe(3);
    expect(resolveScheduleViewState(rows, { phase: "wat", week: "5" }, "premier", NOW).week).toBe(3);
  });

  it("allows the configured league season to open before its first fixtures are published", () => {
    const state = resolveScheduleViewState([fixture({ season: "S4" })], { season: "S5" }, "premier", NOW, "S5");
    expect(state).toMatchObject({ season: "S5", fixtures: [], phase: "regular", week: 1 });
  });

  it("defaults from actual unplayed fixtures, including postseason-only seasons", () => {
    const rows = [fixture({ stage: "quarterfinals" }), fixture({ stage: "semifinals", id: "s2", sort_order: 0 })];
    expect(resolveScheduleViewState(rows, {}, "premier", NOW)).toMatchObject({ phase: "playoffs", defaultStage: "quarterfinals" });
  });

  it("chooses the latest populated stage after a completed season and Week 1 for empty data", () => {
    const completed = [
      fixture({ stage: "week_1", score_a: 2, score_b: 1 }),
      fixture({ stage: "finals", id: "final", score_a: 3, score_b: 1, best_of: 5 }),
    ];
    expect(resolveScheduleViewState(completed, {}, "premier", NOW).phase).toBe("playoffs");
    expect(resolveScheduleViewState([], {}, "academy", NOW)).toMatchObject({ phase: "regular", week: 1, season: null });
  });

  it("rejects a foreign season and Academy gauntlet navigation", () => {
    const rows = [fixture({ season: "A1", stage: "finals" }), fixture({ season: "S5", stage: "week_2" })];
    expect(resolveScheduleViewState(rows, { season: "S5", phase: "playoffs" }, "academy", NOW)).toMatchObject({
      season: "A1",
      phase: "playoffs",
    });
    expect(resolveScheduleViewState(rows, { season: "A1", phase: "gauntlet" }, "academy", NOW).phase).toBe("playoffs");
  });

  it("maps only allowlisted legacy stage hashes", () => {
    expect(legacyScheduleHashView("#week_3", "premier")).toEqual({ phase: "regular", week: 3 });
    expect(legacyScheduleHashView("#quarterfinals", "academy")).toEqual({ phase: "playoffs" });
    expect(legacyScheduleHashView("#gauntlet_r1", "academy")).toBeNull();
    expect(legacyScheduleHashView("#anything", "premier")).toBeNull();
  });

  it("keeps season and phase/week in navigation links", () => {
    expect(scheduleViewHref("/schedule", "S4", "regular", 2)).toBe("/schedule?season=S4&phase=regular&week=2");
    expect(stageViewHref("/academy/schedule", "A1", "quarterfinals")).toBe("/academy/schedule?season=A1&phase=playoffs");
  });
});
