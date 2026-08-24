import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { SIGNED_CHANCE } from "./config";
import type { PackPull } from "./rng";
import { applyAutographs } from "./signatures";

/** Minimal pull — only the card's slug matters to the autograph pass. */
const pull = (slug: string): PackPull => ({
  card: { slug, name: slug, tag: "NA1" } as PlayerCardData,
  foil: false,
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
