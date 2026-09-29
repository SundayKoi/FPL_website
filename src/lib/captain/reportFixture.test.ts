import { describe, expect, it } from "vitest";
import { defaultFixtureId, fixtureCandidates, fixtureOptionLabel, type ReportFixture } from "./reportFixture";

const fixture = (overrides: Partial<ReportFixture> & { id: string }): ReportFixture => ({
  stage: "week_1",
  sort_order: 0,
  team_a: "Alcatraz",
  team_b: "Wildcats",
  scheduled_at: "2026-08-10T20:00:00-04:00",
  score_a: null,
  score_b: null,
  ...overrides,
});

describe("fixtureCandidates", () => {
  const week1 = fixture({ id: "w1", score_a: 2, score_b: 0 });
  const semi = fixture({ id: "semi", stage: "semifinals", team_a: "Wildcats", team_b: "Alcatraz", scheduled_at: "2026-09-28T20:00:00-04:00" });
  const other = fixture({ id: "other", team_b: "Bears" });

  it("finds the pair's fixtures in either orientation, earliest first", () => {
    expect(fixtureCandidates([semi, other, week1], "Alcatraz", "Wildcats").map((f) => f.id)).toEqual(["w1", "semi"]);
    expect(fixtureCandidates([semi, other, week1], "wildcats ", "ALCATRAZ").map((f) => f.id)).toEqual(["w1", "semi"]);
  });

  it("offers nothing until both teams are picked, or when they are the same team", () => {
    expect(fixtureCandidates([week1], "Alcatraz", null)).toEqual([]);
    expect(fixtureCandidates([week1], "Alcatraz", "Alcatraz")).toEqual([]);
  });
});

describe("defaultFixtureId", () => {
  const played = fixture({ id: "played", score_a: 3, score_b: 2 });
  const upcoming = fixture({ id: "upcoming", stage: "finals", scheduled_at: "2026-10-05T20:00:00-04:00" });

  it("keeps a choice already made while it is still on the list", () => {
    expect(defaultFixtureId([played, upcoming], "played", "upcoming")).toBe("played");
  });

  it("takes the fixture the page was opened for over the rest", () => {
    expect(defaultFixtureId([played, upcoming], null, "upcoming")).toBe("upcoming");
    expect(defaultFixtureId([played, upcoming], "gone", "upcoming")).toBe("upcoming");
  });

  it("prefers the one fixture still waiting for a result", () => {
    expect(defaultFixtureId([played, upcoming], null, null)).toBe("upcoming");
  });

  // The case that motivated this: a series reported wrong, ingested, and
  // deleted leaves the fixture scored. The correction must still find it.
  it("links a lone fixture even when it already has a score", () => {
    expect(defaultFixtureId([played], null, null)).toBe("played");
  });

  it("leaves it blank when the pair has several played fixtures and no hint", () => {
    const replay = fixture({ id: "replay", stage: "week_2", score_a: 0, score_b: 2 });
    expect(defaultFixtureId([played, replay], null, null)).toBe("");
    expect(defaultFixtureId([], null, "upcoming")).toBe("");
  });
});

describe("fixtureOptionLabel", () => {
  it("names the round, the pairing, the kickoff, and any recorded score", () => {
    expect(fixtureOptionLabel(fixture({ id: "x", stage: "semifinals", scheduled_at: "2026-09-28T20:00:00-04:00", score_a: 3, score_b: 2 }))).toBe(
      "Semifinals · Alcatraz vs Wildcats · Mon, Sep 28, 8:00 PM ET · 3–2 recorded",
    );
    expect(fixtureOptionLabel(fixture({ id: "y", scheduled_at: null }))).toBe("Week 1 · Alcatraz vs Wildcats · Date TBD");
  });
});
