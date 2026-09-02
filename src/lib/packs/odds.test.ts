// The odds, measured — not read off a comment.
//
// Every other pack test scripts `rand` with a queue, which pins the ORDER
// of the roll and proves the bands are wired right. None of them asks the
// question people ask when two rare things land in a row: are the real
// numbers what the config says they are? This file rolls the real roller
// with the real random source — node's CSPRNG, exactly as openPackFor
// builds it — enough times that the answer is a measurement, and expects
// each rate back within a tolerance that a biased roll would blow through
// but a fair one essentially never does.
//
// Tolerances are set at about five standard errors of the sample size, so
// a fair roll fails these roughly never (well under one run in a million)
// and a roll that is off by even a fifth fails every time.

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import {
  ECLIPSE_CHANCE,
  FOIL_CHANCE,
  FOIL_TYPE_WEIGHTS,
  FOIL_TYPES,
  PACK_SIZE,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  SIGNED_CHANCE,
  rarityOf,
} from "./config";
import { rollEclipseCandidates } from "./eclipse";
import { rollPack } from "./rng";
import { applyAutographs } from "./signatures";

/** The production random source, byte for byte (open.ts). */
const rand = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;

function card(slug: string, tier: PlayerCardData["tier"]["key"], standout = false): PlayerCardData {
  return {
    slug,
    name: slug,
    tag: "NA1",
    teamName: null,
    teamImageUrl: null,
    role: "Mid",
    overall: 70,
    tier: { key: tier, label: tier },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: 0,
    collectionSize: 0,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout,
    wins: 0,
    losses: 0,
    winratePct: 0,
    level: 0,
    pentas: 0,
    season: "S5",
  } as PlayerCardData;
}

/** A league shaped like a real one: many commons, a few rares, a couple of
 *  epics, two legendaries — one of which is a Card of the Week. Every
 *  class is populated so no roll has to fall to a neighbour. */
const POOL: PlayerCardData[] = [
  ...Array.from({ length: 30 }, (_, i) => card(`c${i}`, i % 3 === 0 ? "bronze" : i % 3 === 1 ? "silver" : "gold")),
  ...Array.from({ length: 10 }, (_, i) => card(`r${i}`, i % 2 ? "platinum" : "emerald")),
  ...Array.from({ length: 4 }, (_, i) => card(`e${i}`, "diamond")),
  card("l0", "master"),
  card("l1", "challenger", true),
];

const PACKS = 40_000;

/** Five standard errors of a proportion at n draws. */
function tolerance(p: number, n: number): number {
  return 5 * Math.sqrt((p * (1 - p)) / n);
}

describe("the pack odds, against the real random source", () => {
  // One big sample, sliced by every question below.
  const pulls = Array.from({ length: PACKS }, () => rollPack(POOL, rand)).flat();
  const slots = pulls.length;

  it("draws the classes at their weights", () => {
    expect(slots).toBe(PACKS * PACK_SIZE);
    const total = RARITY_ORDER.reduce((sum, r) => sum + RARITY_WEIGHTS[r], 0);
    for (const rarity of RARITY_ORDER) {
      const seen = pulls.filter((pull) => rarityOf(pull.card.tier.key) === rarity).length / slots;
      const expected = RARITY_WEIGHTS[rarity] / total;
      // The bad-beat guarantee lifts rare-and-better a touch (an all-common
      // pack has its last slot re-rolled): about 0.24 × 1/5 of slots move
      // out of common. Fold that in rather than pretend it is not there.
      const allCommon = Math.pow(RARITY_WEIGHTS.common / total, PACK_SIZE);
      const shift = allCommon / PACK_SIZE;
      const rest = total - RARITY_WEIGHTS.common;
      const adjusted =
        rarity === "common" ? expected - shift : expected + shift * (RARITY_WEIGHTS[rarity] / rest);
      expect(Math.abs(seen - adjusted)).toBeLessThan(tolerance(adjusted, slots));
    }
  });

  it("picks every card in a class equally often", () => {
    // Thirty commons: each should take a thirtieth of the common pulls.
    const commons = pulls.filter((pull) => rarityOf(pull.card.tier.key) === "common");
    const counts = new Map<string, number>();
    for (const pull of commons) counts.set(pull.card.slug, (counts.get(pull.card.slug) ?? 0) + 1);
    const share = 1 / 30;
    for (let i = 0; i < 30; i += 1) {
      const seen = (counts.get(`c${i}`) ?? 0) / commons.length;
      expect(Math.abs(seen - share)).toBeLessThan(tolerance(share, commons.length));
    }
  });

  it("foils at FOIL_CHANCE, independently of rarity", () => {
    const seen = pulls.filter((pull) => pull.foil).length / slots;
    expect(Math.abs(seen - FOIL_CHANCE)).toBeLessThan(tolerance(FOIL_CHANCE, slots));
    // ...and no more often on the good cards than the bad ones.
    const rare = pulls.filter((pull) => rarityOf(pull.card.tier.key) !== "common");
    const rareFoil = rare.filter((pull) => pull.foil).length / rare.length;
    expect(Math.abs(rareFoil - FOIL_CHANCE)).toBeLessThan(tolerance(FOIL_CHANCE, rare.length));
  });

  it("hands out parallels at their weights inside the foils", () => {
    const foils = pulls.filter((pull) => pull.foil);
    const total = FOIL_TYPES.reduce((sum, t) => sum + FOIL_TYPE_WEIGHTS[t], 0);
    for (const type of FOIL_TYPES) {
      const expected = FOIL_TYPE_WEIGHTS[type] / total;
      const seen = foils.filter((pull) => pull.foilType === type).length / foils.length;
      expect(Math.abs(seen - expected)).toBeLessThan(tolerance(expected, foils.length));
    }
  });

  it("never mints an Eclipse through the foil roll", () => {
    expect(pulls.some((pull) => pull.foilType === ("eclipse" as string))).toBe(false);
  });

  it("signs at SIGNED_CHANCE, only where there is ink to sign with", () => {
    const signatures = new Map(POOL.filter((_, i) => i % 2 === 0).map((c) => [c.slug, "ink"]));
    const signed = applyAutographs(pulls, signatures, rand);
    const eligible = signed.filter((pull) => signatures.has(pull.card.slug));
    const seen = eligible.filter((pull) => pull.signed).length / eligible.length;
    expect(Math.abs(seen - SIGNED_CHANCE)).toBeLessThan(tolerance(SIGNED_CHANCE, eligible.length));
    expect(signed.filter((pull) => !signatures.has(pull.card.slug)).some((pull) => pull.signed)).toBe(false);
    // Ink always prints foil.
    expect(signed.filter((pull) => pull.signed).every((pull) => pull.foil && pull.foilType !== null)).toBe(true);
  });

  it("opens the Eclipse gate on ECLIPSE_CHANCE of Card-of-the-Week pulls, and on nothing else", () => {
    const crowned = pulls.filter((pull) => pull.card.standout).length;
    let hits = 0;
    for (let i = 0; i < pulls.length; i += PACK_SIZE) {
      hits += rollEclipseCandidates(pulls.slice(i, i + PACK_SIZE), rand).length;
    }
    // The gate only ever sees crowned cards, so measure it over many more
    // of them than a pack sample yields.
    const N = 200_000;
    const crownedOnly = Array.from({ length: N }, () => ({ card: POOL[POOL.length - 1] }));
    let gateHits = 0;
    for (let i = 0; i < N; i += 100) gateHits += rollEclipseCandidates(crownedOnly.slice(i, i + 100), rand).length;
    expect(Math.abs(gateHits / N - ECLIPSE_CHANCE)).toBeLessThan(tolerance(ECLIPSE_CHANCE, N));
    // Back in real packs the hits can only have come from crowned pulls.
    expect(hits).toBeLessThanOrEqual(crowned);
    const uncrowned = Array.from({ length: 10_000 }, () => ({ card: POOL[0] }));
    expect(rollEclipseCandidates(uncrowned, rand)).toEqual([]);
  });

  it("puts a Card of the Week in a pack about as often as its class size says", () => {
    // l1 is one of two legendaries, so it should take half of legendary
    // pulls — which is the whole reason Eclipses feel streaky: a thin top
    // class means the SAME card keeps coming up whenever that class hits.
    const legendary = pulls.filter((pull) => rarityOf(pull.card.tier.key) === "legendary");
    const seen = legendary.filter((pull) => pull.card.standout).length / legendary.length;
    expect(Math.abs(seen - 0.5)).toBeLessThan(tolerance(0.5, legendary.length));
  });

  it("does not remember the last pack", () => {
    // Serial correlation: a foil in one slot should not make the next slot
    // any more or less likely to be foil. Compare the foil rate after a
    // foil with the rate overall.
    let afterFoil = 0;
    let foilThenFoil = 0;
    for (let i = 1; i < pulls.length; i += 1) {
      if (pulls[i - 1].foil) {
        afterFoil += 1;
        if (pulls[i].foil) foilThenFoil += 1;
      }
    }
    const seen = foilThenFoil / afterFoil;
    expect(Math.abs(seen - FOIL_CHANCE)).toBeLessThan(tolerance(FOIL_CHANCE, afterFoil));
  });
});
