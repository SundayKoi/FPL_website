import { describe, expect, it } from "vitest";
import {
  compProfileOf,
  compStyleOf,
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  type GauntletCard,
  makeTrialist,
  mulberry32,
  previewCrossroadsChoice,
  roundScore,
  simulateFirstHalf,
  simulateMatch,
  simulateSecondHalf,
  statOf,
} from "./sim";
import {
  CROSSROADS_BY_KEY,
  CROSSROADS_CATALOG,
  safeChoiceOf,
  situationFor,
} from "./crossroads";
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

  it("profiles the same three numbers the identity reads", () => {
    const squad = team(70, { damage: 90, laning: 88 });
    const profile = compProfileOf(squad);
    expect(profile.poke).toBe(89);
    expect(profile.dive).toBe(70);
    expect(profile.protect).toBe(70);
  });
});

describe("crossroads catalog", () => {
  it("covers every momentum from 0 to 100 with exactly one situation", () => {
    for (let momentum = 0; momentum <= 100; momentum += 1) {
      const matches = CROSSROADS_CATALOG.filter(
        (situation) => momentum >= situation.band[0] && momentum <= situation.band[1],
      );
      expect(matches, `momentum ${momentum}`).toHaveLength(1);
      expect(situationFor(momentum).key).toBe(matches[0].key);
    }
  });

  it("gives every situation a safe floor and honest stakes", () => {
    for (const situation of CROSSROADS_CATALOG) {
      expect(situation.choices.length).toBeGreaterThanOrEqual(2);
      const safe = safeChoiceOf(situation);
      for (const choice of situation.choices) {
        expect(choice.lose).toBeLessThanOrEqual(safe.lose);
        // A rolled choice risks more than it pays the safe way — the gamble
        // is the scoreBonus; a no-roll choice stakes nothing.
        if (choice.yourKeys.length === 0) {
          expect(choice.win).toBe(choice.lose);
          expect(choice.scoreBonus).toBe(0);
        } else {
          expect(choice.lose).toBeLessThan(0);
          expect(choice.win).toBeGreaterThan(0);
          expect(choice.scoreBonus).toBeGreaterThan(0);
          expect(choice.theirKeys.length).toBeGreaterThan(0);
        }
      }
      expect(CROSSROADS_BY_KEY.get(situation.key)).toBe(situation);
    }
  });

  it("previews the exact check: your keys + bonus + relic help vs their keys", () => {
    const situation = CROSSROADS_BY_KEY.get("the_baron_question")!;
    const contest = situation.choices.find((choice) => choice.key === "contest")!;
    const preview = previewCrossroadsChoice(contest, team(80), team(70), { crossroadsBonus: 8 });
    expect(preview).toEqual({ yourVal: 80 + contest.bonus + 8, theirVal: 70 });
    // The safe play in PRESS THE LEAD rolls nothing — nothing to preview.
    const press = CROSSROADS_BY_KEY.get("press_the_lead")!;
    expect(previewCrossroadsChoice(safeChoiceOf(press), team(80), team(70), {})).toBeNull();
  });
});

describe("simulateMatch", () => {
  const effects = {};

  it("is deterministic for one seed", () => {
    const a = simulateMatch(team(75), team(72), effects, mulberry32(7));
    const b = simulateMatch(team(75), team(72), effects, mulberry32(7));
    expect(a).toEqual(b);
  });

  it("splits into halves that stitch back into the same match", () => {
    const whole = simulateMatch(team(75), team(72), effects, mulberry32(9));
    const rand = mulberry32(9);
    const half = simulateFirstHalf(team(75), team(72), effects, rand);
    const situation = CROSSROADS_BY_KEY.get(half.situationKey)!;
    const rest = simulateSecondHalf(half, safeChoiceOf(situation).key, team(75), team(72), effects, rand);
    expect(rest).toEqual(whole);
    expect(half.situationKey).toBe(situationFor(half.momentum).key);
  });

  it("a stronger team wins far more often than it loses", () => {
    let wins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (simulateMatch(team(80), team(60), effects, mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(170);
  });

  it("an even match is near a coin flip — fights carry no home cushion", () => {
    // v2 removed v1's survival discount on lost fights (strong lineups
    // farmed the asymmetry into cheap full clears). What remains is a few
    // points of lean from the safe crossroads play paying a small sure
    // gain. This band is the contract: past ~64%, the sim got rigged.
    let wins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (simulateMatch(team(72), team(72), effects, mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(88);
    expect(wins).toBeLessThan(128);
  });

  it("always narrates: draft, lanes, objectives, fights, the crossroads, the nexus", () => {
    const result = simulateMatch(team(75), team(70), effects, mulberry32(3));
    const kinds = result.events.map((event) => event.kind);
    expect(kinds[0]).toBe("draft");
    expect(kinds).toContain("lanes");
    expect(kinds.filter((kind) => kind === "objective")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "fight")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "crossroads")).toHaveLength(1);
    expect(kinds[kinds.length - 1]).toBe("nexus");
    expect(result.lanes).toHaveLength(5);
    expect(result.mvp).toBeTruthy();
  });

  it("pays daring only on a landed call in a WON match", () => {
    let landedWins = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const yours = team(85);
      const result = simulateMatch(yours, team(70), effects, mulberry32(seed), (situation) => {
        // Always gamble: the biggest scoreBonus on the table.
        return [...situation.choices].sort((a, b) => b.scoreBonus - a.scoreBonus)[0].key;
      });
      const crossroads = result.events.find((event) => event.kind === "crossroads")!;
      if (result.won && crossroads.tone === "win") {
        landedWins += 1;
        expect(result.daring).toBeGreaterThan(0);
      } else {
        expect(result.daring).toBe(0);
      }
    }
    expect(landedWins).toBeGreaterThan(100);
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

    // Fight flat: both fights tilt the same way.
    let plainFights = 0;
    let juicedFights = 0;
    for (let seed = 0; seed < 100; seed += 1) {
      const plain = simulateMatch(team(70), team(70), {}, mulberry32(seed));
      const juiced = simulateMatch(team(70), team(70), { fightFlat: 25 }, mulberry32(seed));
      plainFights += plain.events.filter((e) => e.kind === "fight" && e.tone === "win").length;
      juicedFights += juiced.events.filter((e) => e.kind === "fight" && e.tone === "win").length;
    }
    expect(juicedFights).toBeGreaterThan(plainFights);
  });
});

describe("roundScore", () => {
  it("pays wins by round and margin, taxes trialists, and lets shine pay score only", () => {
    const lineup = team(70);
    const won = { won: true, momentum: 70, daring: 0 };
    expect(roundScore(1, { won: false, momentum: 40, daring: 0 }, lineup, {})).toBe(0);
    const early = roundScore(1, won, lineup, {});
    const late = roundScore(7, won, lineup, {});
    expect(late).toBeGreaterThan(early);

    const withTrialist = [...team(70).slice(0, 4), makeTrialist("Support")];
    expect(roundScore(1, won, withTrialist, {})).toBe(early - 40);

    const shinyLineup = team(70).map((card, index) => (index === 0 ? { ...card, foil: true } : card));
    expect(roundScore(1, won, shinyLineup, { styleScorePerShiny: 15 })).toBe(early + 15);
  });

  it("folds a landed call's daring bonus straight into the round", () => {
    const lineup = team(70);
    const quiet = roundScore(3, { won: true, momentum: 60, daring: 0 }, lineup, {});
    const bold = roundScore(3, { won: true, momentum: 60, daring: 90 }, lineup, {});
    expect(bold).toBe(quiet + 90);
  });
});

describe("relics", () => {
  it("aggregates multiplicatively and additively by kind", () => {
    const fx = aggregateEffects(["home_crowd", "lane_kingdom", "smite_tax", "blood_in_the_water", "cold_blood"]);
    expect(fx.snowballMult).toBeCloseTo(1.5);
    expect(fx.laneMomentumMult).toBeCloseTo(1.5 * 1.1);
    expect(fx.objectivesFlat).toBe(10);
    expect(fx.earlyFightBonus).toBe(8 + 3);

    const flats = aggregateEffects(["overtime", "glass_cannon", "shot_caller", "deep_wards", "the_banker"]);
    expect(flats.fightFlat).toBe(6 + 8);
    expect(flats.lanesFlat).toBe(-3);
    expect(flats.holdFlat).toBe(-8 + 8);
    expect(flats.crossroadsBonus).toBe(8);
    expect(flats.bankBonusPct).toBe(15);
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
      "fightFlat", "lanesFlat", "holdFlat", "crossroadsBonus", "bankBonusPct",
    ]);
    for (const relic of RELIC_CATALOG) {
      for (const key of Object.keys(relic.effects)) expect(known.has(key), `${relic.key}.${key}`).toBe(true);
    }
  });
});

describe("calibration — the run curve itself", () => {
  it("keeps full clears rare but real: 1.5–5.5% over a thousand naive runs", () => {
    // The contract the whole mode balances against, measured the way a
    // cautious run plays (safe crossroads call every time, relics
    // accumulate, first offer taken). v2 sits near 3% — down from v1's
    // curve, which fell on the second try. Good crossroads play claws a
    // little back; a strong REAL lineup (uneven bars, Fresh Legs, chosen
    // relics) claws back more. If a sim or bracket change moves this band,
    // that's a deliberate rebalance, not a refactor.
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
    expect(full).toBeGreaterThanOrEqual(15);
    expect(full).toBeLessThanOrEqual(55);
  });
});

describe("opponents", () => {
  it("ramps the bracket off the lineup and clamps the extremes", () => {
    expect(bracketTarget(70, 1)).toBeLessThan(70);
    expect(bracketTarget(70, 8)).toBeGreaterThan(70);
    expect(bracketTarget(70, 8)).toBeGreaterThan(bracketTarget(70, 4));
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
