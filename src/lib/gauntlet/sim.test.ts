import { describe, expect, it } from "vitest";
import {
  compStyleOf,
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  type GauntletCard,
  makeTrialist,
  mulberry32,
  roundScore,
  simulateMatch,
  statOf,
} from "./sim";
import { aggregateEffects, offerRelics, RELIC_CATALOG } from "./relics";
import { bracketTarget, generateOpponent } from "./opponents";

/** A five-card team at one flat rating, stats shaped by `shape`. */
function team(overall: number, shape: Partial<Record<string, number>> = {}): GauntletCard[] {
  return GAUNTLET_ROLES.map((role, index) => ({
    inventoryId: index + 1,
    name: `${role} ${overall}`,
    role,
    overall,
    stats: Object.fromEntries(
      ["combat", "damage", "economy", "laning", "vision", "objectives", "turrets", "survival", "presence", "impact"].map(
        (key) => [key, shape[key] ?? overall],
      ),
    ),
    foil: false,
    signed: false,
    fresh: false,
  }));
}

describe("mulberry32", () => {
  it("is deterministic per seed and different across seeds", () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b = mulberry32(43);
    const runA1 = [a1(), a1(), a1()];
    const runA2 = [a2(), a2(), a2()];
    const runB = [b(), b(), b()];
    expect(runA1).toEqual(runA2);
    expect(runA1).not.toEqual(runB);
    for (const value of runA1) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of runA1) expect(value).toBeLessThan(1);
  });
});

describe("statOf", () => {
  it("reads the real bar, falls back near overall, and adds Fresh Legs", () => {
    const card = team(70)[0];
    expect(statOf(card, "combat")).toBe(70);
    const bare: GauntletCard = { ...card, stats: {} };
    expect(statOf(bare, "combat")).toBe(65);
    const fresh: GauntletCard = { ...card, fresh: true };
    expect(statOf(fresh, "combat")).toBe(70 + FRESH_LEGS_BONUS);
  });

  it("never reads foil or ink — cosmetics stay cosmetic in the fight", () => {
    const plain = team(70)[0];
    const shiny: GauntletCard = { ...plain, foil: true, signed: true };
    for (const key of ["combat", "damage", "survival", "impact"] as const) {
      expect(statOf(shiny, key)).toBe(statOf(plain, key));
    }
  });
});

describe("compStyleOf", () => {
  it("reads the stat shape as an identity", () => {
    expect(compStyleOf(team(70, { damage: 90, laning: 88 }))).toBe("poke");
    expect(compStyleOf(team(70, { combat: 92, presence: 90 }))).toBe("dive");
    expect(compStyleOf(team(70, { survival: 93, vision: 91 }))).toBe("protect");
  });
});

describe("simulateMatch", () => {
  const effects = {};

  it("is deterministic for one seed", () => {
    const a = simulateMatch(team(75), team(72), effects, mulberry32(7));
    const b = simulateMatch(team(75), team(72), effects, mulberry32(7));
    expect(a).toEqual(b);
  });

  it("a stronger team wins far more often than it loses", () => {
    let wins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (simulateMatch(team(80), team(60), effects, mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(170);
  });

  it("an even match is contested, with at most a mild home edge", () => {
    // The one bias the sim keeps ON PURPOSE: your survival cushions your
    // lost fights (the enemy gets no mirror), so an even match leans a few
    // points toward the runner — a roguelike should feel winnable, and the
    // bracket ramp restores the difficulty. This band is the contract: if
    // a change pushes an even match past ~65%, the sim got rigged.
    let wins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (simulateMatch(team(72), team(72), effects, mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(85);
    expect(wins).toBeLessThan(135);
  });

  it("always narrates: draft, lanes, objectives, fights, and the call", () => {
    const result = simulateMatch(team(75), team(70), effects, mulberry32(3));
    const kinds = result.events.map((event) => event.kind);
    expect(kinds[0]).toBe("draft");
    expect(kinds).toContain("lanes");
    expect(kinds.filter((kind) => kind === "objective")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "fight")).toHaveLength(2);
    expect(kinds[kinds.length - 1]).toBe("nexus");
    expect(result.lanes).toHaveLength(5);
    expect(result.mvp).toBeTruthy();
  });

  it("relic effects move outcomes the way the catalog says", () => {
    // Objective flat: with a big enough bonus, the objective contests tilt.
    let plainObj = 0;
    let taxedObj = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const plain = simulateMatch(team(70), team(70), {}, mulberry32(seed));
      const taxed = simulateMatch(team(70), team(70), { objectivesFlat: 25 }, mulberry32(seed));
      plainObj += plain.events.filter((e) => e.kind === "objective" && e.tone === "win").length;
      taxedObj += taxed.events.filter((e) => e.kind === "objective" && e.tone === "win").length;
    }
    expect(taxedObj).toBeGreaterThan(plainObj);
  });
});

describe("roundScore", () => {
  it("pays wins by round and margin, taxes trialists, and lets shine pay score only", () => {
    const lineup = team(70);
    const won = { won: true, momentum: 70 };
    expect(roundScore(1, { won: false, momentum: 40 }, lineup, {})).toBe(0);
    const early = roundScore(1, won, lineup, {});
    const late = roundScore(7, won, lineup, {});
    expect(late).toBeGreaterThan(early);

    const withTrialist = [...team(70).slice(0, 4), makeTrialist("Support")];
    expect(roundScore(1, won, withTrialist, {})).toBe(early - 40);

    const shinyLineup = team(70).map((card, index) => (index === 0 ? { ...card, foil: true } : card));
    expect(roundScore(1, won, shinyLineup, { styleScorePerShiny: 15 })).toBe(early + 15);
  });
});

describe("relics", () => {
  it("aggregates multiplicatively and additively by kind", () => {
    const fx = aggregateEffects(["home_crowd", "lane_kingdom", "smite_tax", "blood_in_the_water", "cold_blood"]);
    expect(fx.snowballMult).toBeCloseTo(1.5);
    expect(fx.laneMomentumMult).toBeCloseTo(1.5 * 1.1);
    expect(fx.objectivesFlat).toBe(10);
    expect(fx.earlyFightBonus).toBe(8 + 3);
  });

  it("offers three unheld relics, seeded, without duplicates", () => {
    const offer = offerRelics(["home_crowd"], mulberry32(5));
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((relic) => relic.key)).size).toBe(3);
    expect(offer.map((relic) => relic.key)).not.toContain("home_crowd");
    // Deterministic per seed.
    expect(offerRelics(["home_crowd"], mulberry32(5)).map((r) => r.key)).toEqual(offer.map((r) => r.key));
  });

  it("keeps every catalog effect inside the sim's vocabulary", () => {
    const known = new Set([
      "laneMomentumMult", "objectivesFlat", "earlyFightBonus", "snowballMult",
      "freshLegsExtra", "styleScorePerShiny", "benchSwap",
    ]);
    for (const relic of RELIC_CATALOG) {
      for (const key of Object.keys(relic.effects)) expect(known.has(key), `${relic.key}.${key}`).toBe(true);
    }
  });
});

describe("calibration — the run curve itself", () => {
  it("keeps full clears rare but real: 2–15% over a thousand naive runs", () => {
    // The contract the whole mode balances against, measured the way a
    // real run plays (relics accumulate, first offer taken — a floor on
    // relic skill). If a sim or bracket change moves this band, that's a
    // deliberate rebalance, not a refactor.
    let full = 0;
    for (let run = 0; run < 1000; run += 1) {
      let alive = true;
      const held: string[] = [];
      for (let round = 1; round <= 8 && alive; round += 1) {
        const opponent = generateOpponent(72, round, mulberry32(run * 97 + round));
        alive = simulateMatch(team(72), opponent.cards, aggregateEffects(held), mulberry32(run * 31 + round * 7)).won;
        if (alive) {
          const offer = offerRelics(held, mulberry32(run * 53 + round * 11));
          if (offer[0]) held.push(offer[0].key);
        }
      }
      if (alive) full += 1;
    }
    expect(full).toBeGreaterThanOrEqual(20);
    expect(full).toBeLessThanOrEqual(150);
  });
});

describe("opponents", () => {
  it("ramps the bracket off the lineup and clamps the extremes", () => {
    expect(bracketTarget(70, 1)).toBeLessThan(70);
    expect(bracketTarget(70, 8)).toBeGreaterThan(70);
    expect(bracketTarget(99, 8)).toBeLessThanOrEqual(92);
    expect(bracketTarget(30, 1)).toBeGreaterThanOrEqual(45);
  });

  it("generates a full five with unique names, near target, reading as its style", () => {
    const opponent = generateOpponent(72, 4, mulberry32(11));
    expect(opponent.cards).toHaveLength(5);
    expect(new Set(opponent.cards.map((card) => card.name)).size).toBe(5);
    expect(new Set(opponent.cards.map((card) => card.role)).size).toBe(5);
    expect(Math.abs(opponent.avg - bracketTarget(72, 4))).toBeLessThanOrEqual(6);
    expect(compStyleOf(opponent.cards)).toBe(opponent.style);
    expect(opponent.label).toContain("COMP");
  });

  it("is deterministic per seed", () => {
    expect(generateOpponent(72, 4, mulberry32(11))).toEqual(generateOpponent(72, 4, mulberry32(11)));
  });
});
