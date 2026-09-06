import { describe, expect, it } from "vitest";
import { CONTRACTS_PER_WEEK, CONTRACT_CATALOG, contractsForWeek, contractsSatisfied, type ContractRound } from "./contracts";
import { nextOpener, openerAllowed, openerEffects, unlockedOpeners } from "./openers";

const baron = { attempted: false, yours: false, clock: 25, hpAtResolve: 100, shortBy: 0, taken: false, stolen: false, note: "" };

function round(over: Partial<ContractRound> = {}): ContractRound {
  return {
    run: { round: 2, lineup: [], relics: [], ascension: 0 },
    state: { momentum: 55, lanesWon: 3 },
    result: { won: true, yourStyle: "dive", daring: 0, baron, momentum: 60 },
    opponent: { boss: null },
    ...over,
  };
}

describe("contractsForWeek", () => {
  it("is three distinct contracts, the same for the whole week, and different weeks differ", () => {
    const a = contractsForWeek("2026-08-24");
    expect(a).toHaveLength(CONTRACTS_PER_WEEK);
    expect(new Set(a.map((c) => c.key)).size).toBe(CONTRACTS_PER_WEEK);
    expect(contractsForWeek("2026-08-24").map((c) => c.key)).toEqual(a.map((c) => c.key));
    const weeks = ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"].map((week) => contractsForWeek(week).map((c) => c.key).join("|"));
    expect(new Set([a.map((c) => c.key).join("|"), ...weeks]).size).toBeGreaterThan(1);
  });

  it("has a printed blurb and a positive reward on every contract", () => {
    for (const contract of CONTRACT_CATALOG) {
      expect(contract.blurb.length).toBeGreaterThan(5);
      expect(contract.reward).toBeGreaterThan(0);
      expect(contract.reward).toBeLessThanOrEqual(40);
    }
  });
});

describe("the checks", () => {
  const by = (key: string) => CONTRACT_CATALOG.find((c) => c.key === key)!.check;

  it("read the round, the comp, the crossroads, the Baron and the opponent", () => {
    expect(by("past_the_gate")(round({ run: { round: 4, lineup: [], relics: [], ascension: 0 } }))).toBe(true);
    expect(by("past_the_gate")(round())).toBe(false);
    expect(by("protect_and_serve")(round({ result: { ...round().result, yourStyle: "protect" } }))).toBe(true);
    expect(by("from_the_pit")(round({ state: { momentum: 30, lanesWon: 1 } }))).toBe(true);
    expect(by("from_the_pit")(round())).toBe(false);
    expect(by("the_daring")(round({ result: { ...round().result, daring: 75 } }))).toBe(true);
    expect(by("baron_blood")(round({ result: { ...round().result, baron: { ...baron, attempted: true, yours: true, taken: true } } }))).toBe(true);
    expect(by("the_steal")(round({ result: { ...round().result, baron: { ...baron, attempted: true, stolen: true } } }))).toBe(true);
    expect(by("clean_sweep")(round({ state: { momentum: 70, lanesWon: 5 } }))).toBe(true);
    expect(by("wall_breaker")(round({ opponent: { boss: "gatekeeper" } }))).toBe(true);
    expect(by("ghost_hunter")(round({ opponent: { boss: null, ghost: { runId: 1, name: "x", score: 1, trueAvg: 70, relics: [], choiceKey: null, bounty: true } } }))).toBe(true);
    expect(by("the_climber")(round({ run: { round: 1, lineup: [], relics: [], ascension: 2 } }))).toBe(true);
    expect(by("fresh_legs")(round({ run: { round: 1, lineup: [{ fresh: true }, { fresh: true }] as never, relics: [], ascension: 0 } }))).toBe(true);
  });
});

describe("contractsSatisfied", () => {
  it("returns only this week's open contracts the win satisfies, and nothing on a loss", () => {
    const week = "2026-08-24";
    const offered = contractsForWeek(week);
    // A round that satisfies everything satisfiable in one game.
    const big = round({
      run: { round: 6, lineup: [{ fresh: true }, { fresh: true }] as never, relics: [], ascension: 1 },
      state: { momentum: 30, lanesWon: 5 },
      result: { won: true, yourStyle: "protect", daring: 90, baron: { ...baron, attempted: true, yours: true, taken: true, stolen: true }, momentum: 80 },
      opponent: { boss: "closer", ghost: { runId: 1, name: "x", score: 1, trueAvg: 70, relics: [], choiceKey: null, bounty: true } },
    });
    const satisfied = contractsSatisfied(week, [], big);
    expect(satisfied.length).toBeGreaterThan(0);
    for (const contract of satisfied) expect(offered).toContain(contract);
    // Already done this week: not paid again.
    expect(contractsSatisfied(week, satisfied.map((c) => c.key), big)).toEqual([]);
    expect(contractsSatisfied(week, [], { ...big, result: { ...big.result, won: false } })).toEqual([]);
  });
});

describe("openers", () => {
  it("unlock in order by contracts finished, and say what is next", () => {
    expect(unlockedOpeners(0)).toEqual([]);
    expect(unlockedOpeners(5).map((o) => o.key)).toEqual(["warm_up", "the_map"]);
    expect(nextOpener(5)).toMatchObject({ opener: { key: "study_tape" }, remaining: 4 });
    expect(nextOpener(99)).toBeNull();
  });

  it("bring a small dial, or nothing", () => {
    expect(openerEffects("warm_up")).toEqual({ earlyFightBonus: 2 });
    expect(openerEffects(null)).toEqual({});
    expect(openerEffects("nope")).toEqual({});
    expect(openerAllowed(null, 0)).toBe(true);
    expect(openerAllowed("warm_up", 1)).toBe(false);
    expect(openerAllowed("warm_up", 2)).toBe(true);
    expect(openerAllowed("nope", 99)).toBe(false);
  });
});
