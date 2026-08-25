import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { FOIL_CHANCE, PACK_SIZE, type CardTierKey } from "./config";
import { rollPack } from "./rng";

/** Minimal card — only tier/slug matter to the roller, the rest is ballast
 *  so the fixture type-checks against the real PlayerCardData. */
const card = (slug: string, tier: CardTierKey): PlayerCardData => ({
  slug,
  name: slug,
  tag: "NA1",
  teamName: null,
  teamImageUrl: null,
  role: "Mid",
  overall: 50,
  tier: { key: tier, label: tier },
  archetype: "Jack of All Trades",
  signature: null,
  artSkin: 0,
  motto: null,
  serial: 1,
  collectionSize: 1,
  topChampions: [],
  form: [],
  subStats: [],
  highlights: [],
  badges: [],
  standout: false,
  wins: 0,
  losses: 0,
  winratePct: 0,
  level: 0,
  pentas: 0,
  season: "S5",
});

/**
 * A rand that hands back a fixed script, so every roll is spelled out.
 * Throws when overrun — an exhausted queue means the roller consumed more
 * values than the test expected, which is itself a regression.
 */
function scripted(values: number[]): () => number {
  let index = 0;
  return () => {
    if (index >= values.length) throw new Error(`scripted rand exhausted after ${values.length} values`);
    return values[index++];
  };
}

/** Class thresholds over weights {75, 20, 4, 1} (cumulative 0.75 / 0.95 /
 *  0.99 / 1): these rand values land in common / rare / epic / legendary. */
const CLASS = { common: 0.5, rare: 0.8, epic: 0.96, legendary: 0.995 };
const NO_FOIL = 0.5;
const FIRST = 0;

/** One slot's three rand values, in the order rollPack consumes them. */
/** One slot's rand values: class, index, foil — and a fourth ONLY when the
 *  foil roll lands, matching pull()'s conditional parallel roll. */
const slot = (classRoll: number, index = FIRST, foil = NO_FOIL, parallel?: number) =>
  foil < FOIL_CHANCE ? [classRoll, index, foil, parallel ?? 0] : [classRoll, index, foil];

const tiersOf = (pulls: { card: PlayerCardData }[]) => pulls.map((pull) => pull.card.tier.key);

const fullPool = [card("bronzey", "bronze"), card("platty", "platinum"), card("diamondy", "diamond"), card("mastery", "master")];

describe("rollPack", () => {
  it("maps each class band to a card of that rarity, in the order rolled", () => {
    const pulls = rollPack(
      fullPool,
      scripted([
        ...slot(CLASS.common),
        ...slot(CLASS.rare),
        ...slot(CLASS.epic),
        ...slot(CLASS.legendary),
        ...slot(CLASS.rare),
      ]),
    );

    expect(pulls).toHaveLength(PACK_SIZE);
    expect(tiersOf(pulls)).toEqual(["bronze", "platinum", "diamond", "master", "platinum"]);
  });

  it("picks uniformly within the rolled class", () => {
    const commons = [card("a", "bronze"), card("b", "silver"), card("c", "gold"), card("d", "platinum")];
    const pulls = rollPack(
      commons,
      // three commons in the pool, so index rolls 0 / 0.5 / 0.9 -> a / b / c
      scripted([
        ...slot(CLASS.common, 0),
        ...slot(CLASS.common, 0.5),
        ...slot(CLASS.common, 0.9),
        ...slot(CLASS.common, 0),
        ...slot(CLASS.rare, 0),
      ]),
    );

    expect(pulls.map((pull) => pull.card.slug)).toEqual(["a", "b", "c", "a", "d"]);
  });

  it("falls to the next-lower class when the rolled one is empty", () => {
    const pool = [card("bronzey", "bronze"), card("platty", "platinum")];
    const pulls = rollPack(
      pool,
      // every slot rolls legendary; nothing above rare exists in this league
      scripted([
        ...slot(CLASS.legendary),
        ...slot(CLASS.legendary),
        ...slot(CLASS.legendary),
        ...slot(CLASS.legendary),
        ...slot(CLASS.legendary),
      ]),
    );

    expect(tiersOf(pulls)).toEqual(["platinum", "platinum", "platinum", "platinum", "platinum"]);
  });

  it("falls upward when there is nothing lower to fall to", () => {
    const pool = [card("mastery", "master")];
    const pulls = rollPack(
      pool,
      scripted([
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
      ]),
    );

    expect(tiersOf(pulls)).toEqual(["master", "master", "master", "master", "master"]);
  });

  it("replaces the last slot when five commons rolled", () => {
    const pool = [card("bronzey", "bronze"), card("platty", "platinum")];
    const pulls = rollPack(
      pool,
      scripted([
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        // the forced guarantee pull: class, then index, then foil
        FIRST,
        FIRST,
        NO_FOIL,
      ]),
    );

    expect(tiersOf(pulls)).toEqual(["bronze", "bronze", "bronze", "bronze", "platinum"]);
  });

  it("rolls the guarantee across rare-and-better classes by weight, not from the top", () => {
    // Eligible classes here are rare (20) and legendary (1): renormalized,
    // rare owns [0, 20/21) of the ticket. A middling roll upgrades to a
    // platinum; only the tail of the ticket hands out the Master — the old
    // best-class behavior made the league's rarest card the GUARANTEED pull
    // of every bad-beat pack, which inverted rarity.
    const pool = [card("bronzey", "bronze"), card("platty", "platinum"), card("mastery", "master")];
    const allCommons = [...Array(PACK_SIZE)].flatMap(() => slot(CLASS.common));

    const modest = rollPack(pool, scripted(allCommons.concat([0.5, FIRST, NO_FOIL])));
    expect(tiersOf(modest)).toEqual(["bronze", "bronze", "bronze", "bronze", "platinum"]);

    const jackpot = rollPack(pool, scripted(allCommons.concat([0.99, FIRST, NO_FOIL])));
    expect(tiersOf(jackpot)).toEqual(["bronze", "bronze", "bronze", "bronze", "master"]);
  });

  it("leaves an all-common pack alone when the league has nothing rarer", () => {
    const pool = [card("bronzey", "bronze"), card("silvery", "silver")];
    // no extra rand values scripted: a replacement roll here would throw
    const pulls = rollPack(pool, scripted([...Array(PACK_SIZE)].flatMap(() => slot(CLASS.common))));

    expect(tiersOf(pulls)).toEqual(["bronze", "bronze", "bronze", "bronze", "bronze"]);
  });

  it("does not fire the guarantee when a rare already landed", () => {
    const pool = [card("bronzey", "bronze"), card("platty", "platinum")];
    const pulls = rollPack(
      pool,
      scripted([
        ...slot(CLASS.common),
        ...slot(CLASS.rare),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
        ...slot(CLASS.common),
      ]),
    );

    expect(tiersOf(pulls)).toEqual(["bronze", "platinum", "bronze", "bronze", "bronze"]);
  });

  it("flags foils strictly below FOIL_CHANCE", () => {
    const pulls = rollPack(
      fullPool,
      scripted([
        ...slot(CLASS.rare, FIRST, 0),
        ...slot(CLASS.rare, FIRST, FOIL_CHANCE - 0.001),
        ...slot(CLASS.rare, FIRST, FOIL_CHANCE),
        ...slot(CLASS.rare, FIRST, 0.5),
        ...slot(CLASS.rare, FIRST, 0.999),
      ]),
    );

    expect(pulls.map((pull) => pull.foil)).toEqual([true, true, false, false, false]);
  });

  it("rolls a parallel only for the foils, and leaves the rest null", () => {
    // A foil type on a matte card is a lie the renderer would believe, and
    // the database now rejects the pairing outright.
    const pulls = rollPack(
      fullPool,
      scripted([
        ...slot(CLASS.rare, FIRST, 0, 0),      // foil, first weight bucket
        ...slot(CLASS.rare, FIRST, 0.5),       // not foil
        ...slot(CLASS.rare, FIRST, 0.5),
        ...slot(CLASS.rare, FIRST, 0.5),
        ...slot(CLASS.rare, FIRST, 0.5),
      ]),
    );

    expect(pulls.map((pull) => pull.foilType)).toEqual(["prisma", null, null, null, null]);
  });

  it("spends only two rand values on a card that is not foil", () => {
    // The parallel roll is conditional so the 94% of pulls that are matte
    // leave the sequence exactly where it has always been. A scripted queue
    // this tight fails loudly if that stops being true.
    expect(() =>
      rollPack(fullPool, scripted([
        ...[CLASS.rare, FIRST, 0.5],
        ...[CLASS.rare, FIRST, 0.5],
        ...[CLASS.rare, FIRST, 0.5],
        ...[CLASS.rare, FIRST, 0.5],
        ...[CLASS.rare, FIRST, 0.5],
      ])),
    ).not.toThrow();
  });

  it("is deterministic for a given rand sequence", () => {
    // a tiny LCG stands in for a real seeded generator
    const seeded = (seed: number) => {
      let state = seed;
      return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };
    };

    const first = rollPack(fullPool, seeded(7));
    const second = rollPack(fullPool, seeded(7));
    const other = rollPack(fullPool, seeded(8));

    expect(first.map((pull) => [pull.card.slug, pull.foil])).toEqual(second.map((pull) => [pull.card.slug, pull.foil]));
    expect(first).toHaveLength(PACK_SIZE);
    expect(other).toHaveLength(PACK_SIZE);
  });

  it("returns an empty pack for an empty pool", () => {
    expect(rollPack([], scripted([]))).toEqual([]);
  });
});
