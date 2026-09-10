import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { SIGNED_CHANCE, SIGNED_CHANCE_CAP } from "./config";
import type { PackPull } from "./rng";
import { applyAutographs, signedChance } from "./signatures";

/** Minimal pull — only the card's slug matters to the autograph pass. */
const pull = (slug: string): PackPull => ({
  card: { slug, name: slug, tag: "NA1" } as PlayerCardData,
  foil: false,
  foilType: null,
});

const INK = "data:image/png;base64,AAAA";

/** Same scripted rand as rng.test.ts: throws when overrun, so a test that
 *  says "consumes nothing" fails loudly if the roll consumes anything. */
function scripted(values: number[]): () => number {
  let index = 0;
  return () => {
    if (index >= values.length) throw new Error(`scripted rand exhausted after ${values.length} values`);
    return values[index++];
  };
}

describe("applyAutographs", () => {
  it("signs a pull that rolls under the chance and inks that player's signature", () => {
    const signed = applyAutographs([pull("7gen-na1")], new Map([["7gen-na1", INK]]), scripted([SIGNED_CHANCE - 0.001]));

    expect(signed[0].signed).toBe(true);
    expect(signed[0].autograph).toBe(INK);
  });

  it("prints every signed copy foil, and leaves an unsigned pull's foil alone", () => {
    const signed = applyAutographs([pull("7gen-na1")], new Map([["7gen-na1", INK]]), scripted([SIGNED_CHANCE - 0.001]));
    expect(signed[0].foil).toBe(true);

    const missed = applyAutographs([pull("7gen-na1")], new Map([["7gen-na1", INK]]), scripted([0.9]));
    expect(missed[0].foil).toBe(false);

    const alreadyFoil = applyAutographs(
      [{ ...pull("7gen-na1"), foil: true }],
      new Map([["7gen-na1", INK]]),
      scripted([0.9]),
    );
    expect(alreadyFoil[0].foil).toBe(true);
  });

  it("leaves a pull unsigned at or above the chance", () => {
    const signed = applyAutographs(
      [pull("7gen-na1"), pull("7gen-na1")],
      new Map([["7gen-na1", INK]]),
      scripted([SIGNED_CHANCE, 0.9]),
    );

    expect(signed.map((entry) => entry.signed)).toEqual([false, false]);
    expect(signed.every((entry) => entry.autograph === null)).toBe(true);
  });

  it("consumes no rand for players who have not signed", () => {
    // Only the middle pull can roll, so a single scripted value has to be
    // enough — an extra roll for either neighbour would exhaust the queue.
    const signed = applyAutographs(
      [pull("nosig-na1"), pull("7gen-na1"), pull("alsonosig-na1")],
      new Map([["7gen-na1", INK]]),
      scripted([0]),
    );

    expect(signed.map((entry) => entry.signed)).toEqual([false, true, false]);
    expect(signed.map((entry) => entry.autograph)).toEqual([null, INK, null]);
  });

  it("rolls nothing at all when nobody in the league has signed", () => {
    const pulls = [pull("a-na1"), pull("b-na1"), pull("c-na1")];
    const signed = applyAutographs(pulls, new Map(), scripted([]));

    expect(signed.map((entry) => entry.signed)).toEqual([false, false, false]);
    expect(signed.map((entry) => entry.card.slug)).toEqual(["a-na1", "b-na1", "c-na1"]);
  });

  it("carries the rest of the pull through untouched", () => {
    const foilPull: PackPull = { ...pull("7gen-na1"), foil: true };
    const signed = applyAutographs([foilPull], new Map([["7gen-na1", INK]]), scripted([0]));

    expect(signed[0].foil).toBe(true);
    expect(signed[0].card).toBe(foilPull.card);
  });
});

describe("signedChance", () => {
  const book = (slugs: string[]) => new Map(slugs.map((slug) => [slug, INK]));
  const pool = (n: number) => Array.from({ length: n }, (_, i) => ({ slug: `p${i}-na1` }));

  it("is zero with nobody signed, or an empty pool", () => {
    expect(signedChance(pool(60), new Map())).toBe(0);
    expect(signedChance([], book(["p0-na1"]))).toBe(0);
  });

  it("scales the per-copy roll so the pack as a whole lands on SIGNED_CHANCE", () => {
    // 38 of 60 signed: their copies roll at 0.5% × 60/38, so over the pool
    // the expected signed rate is back to 0.5% a card.
    const cards = pool(60);
    const chance = signedChance(cards, book(cards.slice(0, 38).map((c) => c.slug)));
    expect(chance).toBeCloseTo(SIGNED_CHANCE * (60 / 38), 10);
    expect((chance * 38) / 60).toBeCloseTo(SIGNED_CHANCE, 10);
  });

  it("is exactly SIGNED_CHANCE when the whole pool has signed", () => {
    const cards = pool(12);
    expect(signedChance(cards, book(cards.map((c) => c.slug)))).toBe(SIGNED_CHANCE);
  });

  it("caps a thin signing book at SIGNED_CHANCE_CAP", () => {
    const cards = pool(60);
    expect(signedChance(cards, book(["p0-na1"]))).toBe(SIGNED_CHANCE_CAP);
    // A tenth of the pool signed is where the cap stops biting.
    expect(signedChance(cards, book(cards.slice(0, 6).map((c) => c.slug)))).toBeCloseTo(SIGNED_CHANCE_CAP, 10);
  });

  it("ignores signatures for players outside the pool", () => {
    const cards = pool(10);
    const chance = signedChance(cards, book(["p0-na1", "stranger-na1", "another-na1"]));
    expect(chance).toBe(SIGNED_CHANCE_CAP);
  });
});

describe("applyAutographs with a scaled chance", () => {
  it("rolls each signable pull against the chance it is given", () => {
    const book = new Map([["7gen-na1", INK]]);
    const chance = 0.02;
    const signed = applyAutographs([pull("7gen-na1"), pull("7gen-na1")], book, scripted([chance - 0.001, chance]), chance);
    expect(signed.map((entry) => entry.signed)).toEqual([true, false]);
  });

  it("rolls nothing when the chance is zero, still consuming one rand per signable pull", () => {
    const book = new Map([["7gen-na1", INK]]);
    const signed = applyAutographs([pull("7gen-na1")], book, scripted([0]), 0);
    expect(signed[0].signed).toBe(false);
  });
});
