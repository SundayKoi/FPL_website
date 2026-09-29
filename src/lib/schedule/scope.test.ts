import { describe, expect, it } from "vitest";
import { scopeScheduleFixtures } from "./scope";
import type { FixtureRow } from "./types";

const row = (season: string, stage: FixtureRow["stage"], id: string, team_a: string | null = "Same Team") => ({
  id,
  season,
  stage,
  team_a,
  team_b: null,
  division: null,
  scheduled_at: null,
  best_of: 5,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
}) satisfies FixtureRow;

describe("scopeScheduleFixtures", () => {
  it("uses season ownership even when both leagues reuse a team name", () => {
    const rows = [row("S4", "week_1", "premier"), row("A1", "week_1", "academy")];
    expect(scopeScheduleFixtures(rows, "premier").map((fixture) => fixture.id)).toEqual(["premier"]);
    expect(scopeScheduleFixtures(rows, "academy").map((fixture) => fixture.id)).toEqual(["academy"]);
  });

  it("keeps fully TBD Academy playoff placeholders and excludes gauntlet rows", () => {
    const rows = [
      row("A1", "finals", "tbd-final", null),
      row("A1", "gauntlet_r1", "invalid-gauntlet"),
      row("S5", "finals", "premier-final", null),
    ];
    expect(scopeScheduleFixtures(rows, "academy").map((fixture) => fixture.id)).toEqual(["tbd-final"]);
  });
});
