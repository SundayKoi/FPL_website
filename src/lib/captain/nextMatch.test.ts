import { describe, expect, it } from "vitest";
import { pickNextFixture } from "./nextMatch";
import type { FixtureRow } from "@/lib/schedule/types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "week_1",
    division: null,
    team_a: null,
    team_b: null,
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

describe("pickNextFixture", () => {
  it("returns null when there are no fixtures at all", () => {
    expect(pickNextFixture([], "Mint Ice Cubes")).toBeNull();
  });

  it("returns null when the team has no fixtures", () => {
    const rows = [fixture({ team_a: "Mint Ice Cubes", team_b: "Big Back Catering" })];
    expect(pickNextFixture(rows, "Some Other Team")).toBeNull();
  });

  it("matches team_a or team_b", () => {
    const asA = fixture({ id: "a", team_a: "Mint Ice Cubes", team_b: "Big Back Catering" });
    const asB = fixture({ id: "b", team_a: "Astronauts", team_b: "Mint Ice Cubes" });
    expect(pickNextFixture([asA], "Mint Ice Cubes")?.id).toBe("a");
    expect(pickNextFixture([asB], "Mint Ice Cubes")?.id).toBe("b");
  });

  it("matches case-insensitively after trimming", () => {
    const row = fixture({ team_a: "  Mint Ice Cubes  ", team_b: "Big Back Catering" });
    expect(pickNextFixture([row], "mint ice cubes")).not.toBeNull();
    expect(pickNextFixture([row], "MINT ICE CUBES")).not.toBeNull();
  });

  it("excludes fixtures that already have a reported result", () => {
    const played = fixture({ team_a: "Mint Ice Cubes", team_b: "Big Back Catering", score_a: 2, score_b: 1 });
    expect(pickNextFixture([played], "Mint Ice Cubes")).toBeNull();
  });

  it("picks the earliest scheduled_at among candidates", () => {
    const later = fixture({ id: "later", team_a: "Mint Ice Cubes", scheduled_at: "2026-09-01T00:00:00Z" });
    const earlier = fixture({ id: "earlier", team_a: "Mint Ice Cubes", scheduled_at: "2026-08-15T00:00:00Z" });
    expect(pickNextFixture([later, earlier], "Mint Ice Cubes")?.id).toBe("earlier");
  });

  it("sorts fixtures with no scheduled_at (TBD) after scheduled ones", () => {
    const tbd = fixture({ id: "tbd", team_a: "Mint Ice Cubes", scheduled_at: null, sort_order: 0 });
    const scheduled = fixture({ id: "scheduled", team_a: "Mint Ice Cubes", scheduled_at: "2026-09-01T00:00:00Z", sort_order: 5 });
    expect(pickNextFixture([tbd, scheduled], "Mint Ice Cubes")?.id).toBe("scheduled");
  });

  it("tie-breaks equal scheduled_at (including two TBD rows) by sort_order", () => {
    const first = fixture({ id: "first", team_a: "Mint Ice Cubes", scheduled_at: null, sort_order: 1 });
    const second = fixture({ id: "second", team_a: "Mint Ice Cubes", scheduled_at: null, sort_order: 2 });
    expect(pickNextFixture([second, first], "Mint Ice Cubes")?.id).toBe("first");
  });

  it("ignores fixtures belonging to other teams entirely", () => {
    const mine = fixture({ id: "mine", team_a: "Mint Ice Cubes", team_b: "Big Back Catering", scheduled_at: "2026-09-01T00:00:00Z" });
    const other = fixture({ id: "other", team_a: "Astronauts", team_b: "Divine Ascension", scheduled_at: "2026-08-12T00:00:00Z" });
    expect(pickNextFixture([mine, other], "Mint Ice Cubes")?.id).toBe("mine");
  });
});
