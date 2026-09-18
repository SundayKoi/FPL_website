import { describe, expect, it } from "vitest";
import {
  drawGauntlet,
  resolveRoundOneResult,
  seedRoundTwo,
  seedsFromStandings,
  type DivisionSeeds,
  type RoundOneResult,
} from "./gauntlet";

/** A full 12-team standings list, already in the league's finishing order:
 *  the two divisions interleaved, exactly as the homepage renders them. */
const standings = [
  { name: "S1", division: "Solari" },
  { name: "L1", division: "Lunari" },
  { name: "S2", division: "Solari" },
  { name: "L2", division: "Lunari" },
  { name: "S3", division: "Solari" },
  { name: "L3", division: "Lunari" },
  { name: "S4", division: "Solari" },
  { name: "L4", division: "Lunari" },
  { name: "S5", division: "Solari" },
  { name: "L5", division: "Lunari" },
  { name: "S6", division: "Solari" },
  { name: "L6", division: "Lunari" },
];

const seeds: DivisionSeeds = seedsFromStandings(standings);

const result = (a: string, b: string, scoreA: number, scoreB: number): RoundOneResult => ({
  team_a: a,
  team_b: b,
  score_a: scoreA,
  score_b: scoreB,
});

describe("seedsFromStandings", () => {
  it("splits an ordered standings list into per-division seeds", () => {
    expect(seeds.Solari).toEqual(["S1", "S2", "S3", "S4", "S5", "S6"]);
    expect(seeds.Lunari).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
  });

  it("names the short division rather than drawing half a gauntlet", () => {
    const short = standings.filter((row) => row.name !== "L6");
    expect(() => seedsFromStandings(short)).toThrow(/Lunari has only 5 teams/);
  });

  it("refuses a team with no division", () => {
    expect(() => seedsFromStandings([...standings, { name: "Nomads", division: null }])).toThrow(
      /Nomads/,
    );
  });

  it("refuses a division the league does not have", () => {
    expect(() => seedsFromStandings([...standings, { name: "Nomads", division: "Umbral" }])).toThrow(
      /unknown division "Umbral"/,
    );
  });
});

describe("drawGauntlet", () => {
  it("pairs round 1 across the divisions: S5 v L6 and L5 v S6", () => {
    const roundOne = drawGauntlet(seeds, null).filter((f) => f.stage === "gauntlet_r1");

    expect(roundOne.map((f) => [f.team_a, f.team_b])).toEqual([
      ["S5", "L6"],
      ["L5", "S6"],
    ]);
    expect(roundOne.map((f) => f.sort_order)).toEqual([0, 1]);
    expect(roundOne.every((f) => f.best_of === 1)).toBe(true);
    expect(roundOne.every((f) => f.division === null)).toBe(true);
  });

  it("leaves round 2 as Bo3 placeholders behind each division's 4th seed", () => {
    const roundTwo = drawGauntlet(seeds, null).filter((f) => f.stage === "gauntlet_r2");

    expect(roundTwo.map((f) => [f.team_a, f.team_b])).toEqual([
      ["S4", null],
      ["L4", null],
    ]);
    expect(roundTwo.map((f) => f.sort_order)).toEqual([0, 1]);
    expect(roundTwo.every((f) => f.best_of === 3)).toBe(true);
  });

  it("puts every fixture at the one kickoff, both rounds being on one day", () => {
    const kickoff = "2026-09-22T00:00:00.000Z";
    const drawn = drawGauntlet(seeds, kickoff);

    expect(drawn).toHaveLength(4);
    expect(drawn.every((f) => f.scheduled_at === kickoff)).toBe(true);
  });
});

describe("seedRoundTwo", () => {
  it("sends winners from different divisions to the opposite division's 4th seed", () => {
    // S5 and L5 advance.
    const pairings = seedRoundTwo(seeds, [result("S5", "L6", 1, 0), result("L5", "S6", 1, 0)]);

    expect(pairings).toEqual([
      { team_a: "L4", team_b: "S5" },
      { team_a: "S4", team_b: "L5" },
    ]);
  });

  it("keeps two Solari winners apart: the #6 at home, the #5 across", () => {
    // S5 and S6 advance.
    const pairings = seedRoundTwo(seeds, [result("S5", "L6", 1, 0), result("L5", "S6", 0, 1)]);

    expect(pairings).toEqual([
      { team_a: "S4", team_b: "S6" },
      { team_a: "L4", team_b: "S5" },
    ]);
  });

  it("mirrors that for two Lunari winners", () => {
    // L6 and L5 advance.
    const pairings = seedRoundTwo(seeds, [result("S5", "L6", 0, 1), result("L5", "S6", 1, 0)]);

    expect(pairings).toEqual([
      { team_a: "L4", team_b: "L6" },
      { team_a: "S4", team_b: "L5" },
    ]);
  });

  it("matches team names the way the rest of the league does", () => {
    const pairings = seedRoundTwo(seeds, [
      result(" s5 ", "L6", 1, 0),
      result("L5", "S6", 1, 0),
    ]);

    expect(pairings.map((p) => p.team_b).sort()).toEqual(["L5", "S5"]);
  });

  it("refuses an undecided round-1 series", () => {
    expect(() =>
      seedRoundTwo(seeds, [result("S5", "L6", 0, 0), result("L5", "S6", 1, 0)]),
    ).toThrow(/undecided/);
  });

  it("refuses a winner that never entered round 1", () => {
    expect(() =>
      seedRoundTwo(seeds, [result("S1", "L6", 1, 0), result("L5", "S6", 1, 0)]),
    ).toThrow(/"S1" is not one of the round-1 seeds/);
  });

  it("refuses to seed from a half-played round", () => {
    expect(() => seedRoundTwo(seeds, [result("S5", "L6", 1, 0)])).toThrow(/needs both/);
  });

  it("refuses the same team winning both series", () => {
    expect(() =>
      seedRoundTwo(seeds, [result("S5", "L6", 1, 0), result("S5", "S6", 1, 0)]),
    ).toThrow(/won both round-1 series/);
  });
});

describe("resolveRoundOneResult", () => {
  const unscored = { team_a: "S5", team_b: "L6", score_a: null, score_b: null };

  it("uses the fixture's own score when it has one", () => {
    expect(resolveRoundOneResult({ ...unscored, score_a: 1, score_b: 0 }, null)).toEqual({
      result: { team_a: "S5", team_b: "L6", score_a: 1, score_b: 0 },
      source: "fixture",
      note: null,
    });
  });

  it("prefers the fixture's score over a captain's report that disagrees", () => {
    const resolved = resolveRoundOneResult(
      { ...unscored, score_a: 1, score_b: 0 },
      { team_a: "S5", team_b: "L6", score_a: 0, score_b: 1 },
    );

    expect(resolved.source).toBe("fixture");
    expect(resolved.result).toEqual({ team_a: "S5", team_b: "L6", score_a: 1, score_b: 0 });
  });

  it("falls back to the report on the night, before the ingest has run", () => {
    expect(resolveRoundOneResult(unscored, { team_a: "S5", team_b: "L6", score_a: 1, score_b: 0 })).toEqual({
      result: { team_a: "S5", team_b: "L6", score_a: 1, score_b: 0 },
      source: "report",
      note: null,
    });
  });

  it("swaps the score when the report's sides are the fixture's reversed", () => {
    const resolved = resolveRoundOneResult(unscored, {
      team_a: " l6 ",
      team_b: "S5",
      score_a: 1,
      score_b: 0,
    });

    // The report says L6 won, so in the fixture's side order that is 0-1.
    expect(resolved.result).toEqual({ team_a: "S5", team_b: "L6", score_a: 0, score_b: 1 });
    expect(resolved.source).toBe("report");
  });

  it("takes no result from a report whose sides do not match the fixture", () => {
    const resolved = resolveRoundOneResult(unscored, {
      team_a: "S5",
      team_b: "L5",
      score_a: 1,
      score_b: 0,
    });

    expect(resolved.result).toBeNull();
    expect(resolved.source).toBeNull();
    expect(resolved.note).toContain("S5 vs L6");
  });

  it("takes no result from a report missing a team name", () => {
    const resolved = resolveRoundOneResult(unscored, {
      team_a: "S5",
      team_b: null,
      score_a: 1,
      score_b: 0,
    });

    expect(resolved.result).toBeNull();
    expect(resolved.note).toContain("does not name both teams");
  });

  it("treats a tie from either source as no result", () => {
    expect(resolveRoundOneResult({ ...unscored, score_a: 0, score_b: 0 }, null).result).toBeNull();
    expect(
      resolveRoundOneResult(unscored, { team_a: "S5", team_b: "L6", score_a: 1, score_b: 1 }).result,
    ).toBeNull();
  });

  it("says nothing at all when the series simply has not been played", () => {
    expect(resolveRoundOneResult(unscored, null)).toEqual({ result: null, source: null, note: null });
  });
});
