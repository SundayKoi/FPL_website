// The Eclipse rules, as pure functions.
//
// The decision of WHICH pull becomes a one-of-one needs a database read (has
// this print's Eclipse already been minted?), so that stays in openPackFor.
// What a candidate IS, and what winning does to it, are rules — and rules
// about the rarest object in the game should be readable on their own and
// pinned by tests, not inferred from the middle of a 700-line opener.

import type { PlayerCardData } from "@/lib/cards/build";
import { ECLIPSE_CHANCE, ECLIPSE_FOIL_TYPE } from "./config";

/** The shape the opener carries a rolled copy in, narrowed to what these
 *  rules touch. */
export interface EclipsePrint {
  card: PlayerCardData;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  autograph: string | null;
}

/**
 * Whether a pull could become an Eclipse at all.
 *
 * Cards of the Week only — the top-rated card in each role. Moments and team
 * cards are excluded even when flagged: they are their own kind of object,
 * with their own art and their own dust rules, and an Eclipse frame over a
 * moment plate reads as a rendering bug rather than a chase.
 */
export function isEclipseEligible(card: PlayerCardData): boolean {
  return Boolean(card.standout) && !card.moment && !card.team;
}

/**
 * What winning the Eclipse does to a copy.
 *
 * `ink` is the player's drawn signature, or null if they never drew one.
 * Both cases mint — a player without a signature still gets an Eclipse, it
 * is simply the lesser of the two, which is what makes drawing one worth
 * something.
 *
 * Auto-signing is not generosity. The Eclipse gate and the autograph roll
 * compound to roughly 1 in 91,000 packs, so left to chance no signed Eclipse
 * would ever exist — while an ORDINARY copy of the same player can roll
 * signed at 1%. That inverts the hierarchy: the rarest card in the game
 * would be the plain version of a player whose commons are autographed.
 *
 * An existing signature is never overwritten, and the art is not re-rolled.
 * A signed pull normally rolls alternate art on its own rarer gate, but that
 * roll has already happened by the time an Eclipse is decided — re-rolling
 * it here would consume rand outside the pinned sequence, and a card's art
 * should not change because of something decided after it was drawn.
 */
export function applyEclipse(print: EclipsePrint, ink: string | null): EclipsePrint {
  const autograph = print.autograph ?? ink;
  return {
    ...print,
    foil: true,
    foilType: ECLIPSE_FOIL_TYPE,
    signed: print.signed || autograph !== null,
    autograph,
    // The autograph rides inside the frozen json too, so the copy keeps the
    // ink it was pulled with even if the player redraws later.
    card: { ...print.card, autograph },
  };
}

/**
 * Which pulls in a pack pass the Eclipse gate, by index.
 *
 * One rand per ELIGIBLE pull, and none for the rest — a pack with no Card
 * of the Week in it consumes nothing here. Whether a winner actually mints
 * is decided afterwards against the database (has this print's Eclipse
 * already been claimed?), which is the half that cannot be pure.
 *
 * Exported and pure so the rate can be measured against the real random
 * source rather than asserted from a comment: odds.test.ts rolls this a
 * hundred thousand times and expects ECLIPSE_CHANCE back.
 */
export function rollEclipseCandidates(prints: { card: PlayerCardData }[], rand: () => number): number[] {
  const hits: number[] = [];
  prints.forEach((print, index) => {
    if (isEclipseEligible(print.card) && rand() < ECLIPSE_CHANCE) hits.push(index);
  });
  return hits;
}
