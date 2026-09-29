import { describe, expect, it } from "vitest";
import { findScopedFixture, scopedFixtures } from "./editorScope";
import type { FixtureRow } from "./types";

const fixture = (id: string, season: string) => ({
  id,
  season,
  stage: "finals",
  division: null,
  team_a: null,
  team_b: null,
  scheduled_at: null,
  best_of: 5,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
}) satisfies FixtureRow;

describe("fixture editor scope", () => {
  it("only returns a fixture from the selected season", () => {
    const rows = [fixture("same-id", "S4"), fixture("current", "S5")];
    expect(findScopedFixture(rows, "S5", "same-id")).toBeNull();
    expect(findScopedFixture(rows, "S5", "current")?.id).toBe("current");
    expect(scopedFixtures(rows, null)).toEqual([]);
  });
});
