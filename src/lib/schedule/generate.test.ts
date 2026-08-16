import { describe, expect, it } from "vitest";
import { generateRegularSeason, type GeneratorTeam } from "./generate";
import type { Division } from "./types";

const six = (division: Division, prefix: string): GeneratorTeam[] =>
  Array.from({ length: 6 }, (_, i) => ({ name: `${prefix}${i + 1}`, division }));

const league = [...six("Lunari", "L"), ...six("Solari", "S")];

// Deterministic "random" so the assertions are stable.
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const pairKey = (a: string, b: string) => [a, b].sort().join(" v ");

describe("generateRegularSeason", () => {
  it("gives every team in a division exactly one match against each other team", () => {
    const fixtures = generateRegularSeason(league, { rng: seeded(1) });

    for (const division of ["Lunari", "Solari"] as const) {
      const inDivision = fixtures.filter((f) => f.division === division);
      // 6 teams choose 2 = 15 distinct pairings.
      expect(inDivision).toHaveLength(15);
      expect(new Set(inDivision.map((f) => pairKey(f.team_a, f.team_b))).size).toBe(15);
    }
  });

  it("never pairs teams from different divisions", () => {
    const fixtures = generateRegularSeason(league, { rng: seeded(2) });
    const divisionOf = new Map(league.map((t) => [t.name, t.division]));

    for (const f of fixtures) {
      expect(divisionOf.get(f.team_a)).toBe(f.division);
      expect(divisionOf.get(f.team_b)).toBe(f.division);
    }
  });

  it("plays each team exactly once per week", () => {
    const fixtures = generateRegularSeason(league, { rng: seeded(3) });

    for (const week of ["week_1", "week_2", "week_3", "week_4", "week_5"]) {
      const playing = fixtures
        .filter((f) => f.stage === week)
        .flatMap((f) => [f.team_a, f.team_b]);
      expect(playing).toHaveLength(12);
      expect(new Set(playing).size).toBe(12); // nobody twice, nobody idle
    }
  });

  it("fills exactly the five weeks and marks them Bo3", () => {
    const fixtures = generateRegularSeason(league, { rng: seeded(4) });

    expect(fixtures).toHaveLength(30);
    expect(new Set(fixtures.map((f) => f.stage))).toEqual(
      new Set(["week_1", "week_2", "week_3", "week_4", "week_5"])
    );
    expect(fixtures.every((f) => f.best_of === 3)).toBe(true);
  });

  it("draws a different week 1 for a different shuffle", () => {
    const a = generateRegularSeason(league, { rng: seeded(5) });
    const b = generateRegularSeason(league, { rng: seeded(99) });
    const weekOne = (f: ReturnType<typeof generateRegularSeason>) =>
      f.filter((x) => x.stage === "week_1").map((x) => pairKey(x.team_a, x.team_b)).sort().join();

    expect(weekOne(a)).not.toBe(weekOne(b));
  });

  it("spaces the weeks seven days apart from the start date", () => {
    const fixtures = generateRegularSeason(league, {
      rng: seeded(6),
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
    });

    const at = (week: string) =>
      fixtures.find((f) => f.stage === week)!.scheduled_at;
    expect(at("week_1")).toBe("2026-09-01T00:00:00.000Z");
    expect(at("week_2")).toBe("2026-09-08T00:00:00.000Z");
    expect(at("week_5")).toBe("2026-09-29T00:00:00.000Z");
  });

  it("leaves kickoff times null when no start date is given", () => {
    const fixtures = generateRegularSeason(league, { rng: seeded(7) });
    expect(fixtures.every((f) => f.scheduled_at === null)).toBe(true);
  });

  it("gives an odd division a bye rather than a phantom opponent", () => {
    const odd = [...six("Lunari", "L"), ...six("Solari", "S").slice(0, 5)];
    const fixtures = generateRegularSeason(odd, { rng: seeded(8) });
    const solari = fixtures.filter((f) => f.division === "Solari");

    // 5 teams choose 2 = 10 matches, spread over 5 weeks with one team idle each.
    expect(solari).toHaveLength(10);
    expect(solari.every((f) => f.team_a && f.team_b)).toBe(true);
    for (const week of ["week_1", "week_2", "week_3", "week_4", "week_5"]) {
      expect(solari.filter((f) => f.stage === week)).toHaveLength(2);
    }
  });

  it("refuses to build a partial season when a team has no division", () => {
    const missing: GeneratorTeam[] = [...league, { name: "Homeless", division: null }];
    expect(() => generateRegularSeason(missing, { rng: seeded(9) })).toThrow(/no division yet/);
  });

  it("refuses duplicate team names, since fixtures identify teams by name", () => {
    const dupes: GeneratorTeam[] = [...league, { name: "L1", division: "Lunari" }];
    expect(() => generateRegularSeason(dupes, { rng: seeded(10) })).toThrow(/both called/);
  });

  it("refuses a division too large for five weeks", () => {
    const big: GeneratorTeam[] = Array.from({ length: 8 }, (_, i) => ({
      name: `B${i}`,
      division: "Lunari" as Division,
    }));
    expect(() => generateRegularSeason(big, { rng: seeded(11) })).toThrow(/only has 5/);
  });
});
