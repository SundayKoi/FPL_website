import { describe, expect, it } from "vitest";
import { aggregateEffects, offerRelics, rarityWeights, RELIC_CATALOG, type RelicDef } from "./relics";
import { mulberry32 } from "./sim";

// The offer leans toward the family you are already building. That is a
// balance change, not a cosmetic one — multipliers COMPOUND in
// aggregateEffects, so a focused build is worth more than a scattered one
// and an offer that funnels you into a family is handing that over.
//
// So the lean is measured rather than asserted, and the numbers below are
// locked. They were arrived at by sweeping FAMILY_PULL and reading both
// sides of the trade at each value:
//
//   pull   on-family offered   greedy build power
//   0.00        49.5%                -0.5%
//   0.15        54.3%                +4.1%   <- shipped
//   0.22        56.0%                +7.0%
//   0.30        57.8%                +8.4%
//   0.40        60.1%               +10.1%
//
// Roughly a point of on-family availability per point of power, all the
// way up: there is no free version of this. 0.15 is the deliberate answer
// — a build LEANS rather than locks, and a min-maxer gains a few percent
// rather than a tier.

const famOf = (key: string) => RELIC_CATALOG.find((relic) => relic.key === key)!.family;

/** Every multiplier in RelicEffects multiplied together — the compounding
 *  a focused build actually buys. */
function power(keys: string[]): number {
  const fx = aggregateEffects(keys) as Record<string, unknown>;
  let product = 1;
  for (const [key, value] of Object.entries(fx)) {
    if (key.endsWith("Mult") && typeof value === "number") product *= value;
  }
  return product;
}

function dominantOf(held: string[]): string | null {
  const counts = new Map<string, number>();
  for (const key of held) counts.set(famOf(key), (counts.get(famOf(key)) ?? 0) + 1);
  let best: string | null = null;
  for (const [family, count] of counts) if (!best || count > (counts.get(best) ?? 0)) best = family;
  return best;
}

/** The offer as it was before affinity: three plain weighted draws. The
 *  baseline every number above is measured against. */
function offerFlat(heldKeys: string[], rand: () => number, round: number): RelicDef[] {
  const pool = RELIC_CATALOG.filter((relic) => !heldKeys.includes(relic.key));
  const weights = rarityWeights(round);
  const offer: RelicDef[] = [];
  while (offer.length < 3 && pool.length > 0) {
    const total = pool.reduce((sum, relic) => sum + weights[relic.rarity], 0);
    let ticket = rand() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= weights[pool[i].rarity];
      if (ticket <= 0) { index = i; break; }
    }
    offer.push(pool.splice(index, 1)[0]);
  }
  return offer;
}

type Offer = (held: string[], rand: () => number, round: number) => RelicDef[];

/** A player who always takes their dominant family when it is offered —
 *  the one the affinity helps most, and so the one to measure. */
function loyalist(offer: Offer, seeds = 2000) {
  let onFamily = 0;
  let withAlternative = 0;
  let offers = 0;
  let totalPower = 0;
  let totalFamilies = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const rand = mulberry32(seed);
    const held: string[] = [];
    for (let round = 1; round <= 7; round += 1) {
      const three = offer(held, rand, round);
      if (three.length === 0) break;
      const dominant = dominantOf(held);
      if (dominant) {
        offers += 1;
        if (three.some((relic) => relic.family === dominant)) onFamily += 1;
        if (three.some((relic) => relic.family !== dominant)) withAlternative += 1;
      }
      held.push((three.find((relic) => relic.family === dominant) ?? three[0]).key);
    }
    totalPower += power(held);
    totalFamilies += new Set(held.map(famOf)).size;
  }
  return {
    onFamilyPct: (onFamily / offers) * 100,
    alternativePct: (withAlternative / offers) * 100,
    power: totalPower / seeds,
    families: totalFamilies / seeds,
  };
}

describe("offerRelics", () => {
  it("always leaves an alternative to the build you are on", () => {
    // The rule that keeps this a choice: an offer of three from the family
    // you are already stacking has no decision left in it, and is exactly
    // where compounding would be handed over rather than chosen.
    expect(loyalist(offerRelics).alternativePct).toBe(100);
  });

  it("offers something to build on more often than a flat draw would", () => {
    const before = loyalist(offerFlat).onFamilyPct;
    const after = loyalist(offerRelics).onFamilyPct;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(52);
    expect(after).toBeLessThan(58);
  });

  it("costs a few percent of power, not a tier", () => {
    // The whole point of the sweep in the header. If a future tweak to
    // FAMILY_PULL pushes a min-maxed build past this, the Gauntlet got
    // easier and this is where it is meant to be noticed.
    const before = loyalist(offerFlat).power;
    const after = loyalist(offerRelics).power;
    const deltaPct = ((after - before) / before) * 100;
    expect(deltaPct).toBeGreaterThan(0);
    expect(deltaPct).toBeLessThan(6);
  });

  it("cannot be funnelled into a mono-family build", () => {
    // This is the loyalist — the player actively trying to stack one
    // family every round. Seven relics later they are still spread across
    // about three of the four, which is the difference between a lean and
    // a lock. If this ever drops toward two, the offer stopped being a
    // choice and started being a funnel.
    const families = loyalist(offerRelics).families;
    expect(families).toBeGreaterThan(2.6);
    expect(families).toBeLessThan(3.4);
  });

  it("draws a first offer exactly as it always did", () => {
    // Nothing held, no dominant family, no affinity — so an opening offer
    // is untouched by any of this.
    for (const round of [1, 4, 8]) {
      const mine = offerRelics([], mulberry32(99), round).map((relic) => relic.key);
      const flat = offerFlat([], mulberry32(99), round).map((relic) => relic.key);
      expect(mine).toEqual(flat);
    }
  });

  it("never offers a relic twice, or one already held", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rand = mulberry32(seed);
      const held: string[] = [];
      for (let round = 1; round <= 7; round += 1) {
        const three = offerRelics(held, rand, round);
        expect(new Set(three.map((relic) => relic.key)).size).toBe(three.length);
        for (const relic of three) expect(held).not.toContain(relic.key);
        if (three[0]) held.push(three[0].key);
      }
    }
  });
});

describe("the rule-changers and the set bonus", () => {
  it("carries every rule flag through aggregation and merging", () => {
    const fx = aggregateEffects(["second_wind", "the_oracle", "head_start", "the_rematch", "safe_house", "the_fixer"]);
    expect(fx).toMatchObject({ secondWind: true, oracle: true, baronHeadStart: 30, rerollOffer: true, purseMult: 1.25, bossImmunity: true });
  });

  it("pays a family's set bonus at three, once, and never at two", () => {
    // Three ember relics: the flats they carry, plus the set's +4 fights.
    const three = aggregateEffects(["blood_in_the_water", "overtime", "first_blood"]);
    expect(three.fightFlat).toBe(6 + 4);
    const two = aggregateEffects(["overtime", "glass_cannon"]);
    expect(two.fightFlat).toBe(6 + 8);
    const four = aggregateEffects(["blood_in_the_water", "overtime", "first_blood", "glass_cannon"]);
    expect(four.fightFlat).toBe(6 + 8 + 4);
  });
});
