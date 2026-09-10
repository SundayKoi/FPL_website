// The autograph roll: which pulled copies come out signed.
//
// Kept out of rng.ts on purpose. rollPack's rand-consumption order is pinned
// by rng.test.ts (class → index → foil per slot), and threading a fourth
// roll through it would rewrite every scripted queue in that file — so the
// autograph is a pass over the finished pack instead, sharing the same rand.
//
// Only players who have actually drawn a signature can roll one, and the
// roll happens per pulled copy: the signature is frozen into that copy
// (actions.ts writes it inside the card json), so a later redraw never
// rewrites a card someone already owns.

import { DEFAULT_FOIL_TYPE, SIGNED_CHANCE, SIGNED_CHANCE_CAP } from "./config";
import type { PackPull } from "./rng";

/** A pull with its autograph resolved. `autograph` is the signature PNG
 *  data URI to ink onto this copy, null on every unsigned pull. A signed
 *  pull is always foil (see applyAutographs). */
export type SignedPull = PackPull & { signed: boolean; autograph: string | null };

/**
 * The per-copy roll a signable card faces, given who in the pool has
 * signed. SIGNED_CHANCE is the pack-level promise ("1 in 100 cards"); a
 * card whose player never signed cannot roll at all, so the ones that can
 * roll at SIGNED_CHANCE divided by the signed share of the pool — and the
 * pack as a whole lands back on SIGNED_CHANCE. Capped at SIGNED_CHANCE_CAP
 * so a nearly empty signing book cannot turn one player's card into a
 * print run of autographs. Nobody signed → 0: nothing rolls (and
 * applyAutographs consumes no rand either way).
 *
 * The share is by card, not by pull weight — rollPack draws a class first
 * and a card within it, so a book concentrated in one class lands a touch
 * off the promise. Close enough to be honest, and it keeps this a pure
 * function of the pool and the book.
 */
export function signedChance(pool: readonly { slug: string }[], signaturesBySlug: ReadonlyMap<string, unknown>): number {
  if (pool.length === 0) return 0;
  const signable = pool.filter((card) => signaturesBySlug.has(card.slug)).length;
  if (signable === 0) return 0;
  return Math.min(SIGNED_CHANCE_CAP, SIGNED_CHANCE * (pool.length / signable));
}

/**
 * Marks the signed copies in a rolled pack.
 *
 * `signaturesBySlug` maps a card slug (cardSlug(name, tag)) to that player's
 * signature. A pull whose player has no signature on file consumes NO rand
 * at all — an unsignable pack must not shift the sequence a signable one
 * would see, which is what makes the odds above readable and the tests
 * deterministic. Pulls that can roll consume exactly one value each.
 *
 * `chance` is the per-copy roll for a signable pull — signedChance(pool,
 * book) in the opener, so the pack-level odds hold whatever share of the
 * league has signed. It defaults to the raw SIGNED_CHANCE for callers (and
 * tests) that want the unscaled roll.
 */
export function applyAutographs(
  pulls: PackPull[],
  signaturesBySlug: Map<string, string>,
  rand: () => number,
  chance: number = SIGNED_CHANCE,
): SignedPull[] {
  return pulls.map((pull) => {
    const signature = signaturesBySlug.get(pull.card.slug);
    if (!signature) return { ...pull, signed: false, autograph: null };
    const signed = rand() < chance;
    // Signed copies always print foil. The autograph is the rarest thing in
    // the game, and a matte signed card read as a downgrade next to a foil
    // common — so the foil roll below is overridden rather than re-rolled
    // (no extra rand, the sequence stays pinned).
    return {
      ...pull,
      foil: pull.foil || signed,
      // A promotion, not a parallel win: a copy the autograph turned foil
      // gets the base look, while one that already rolled a parallel keeps
      // it. Assigning rather than rolling is what keeps this pass free of
      // rand, which is the whole reason it lives outside rollPack — and a
      // foil with no type now violates a database constraint, so this can
      // never be left null.
      foilType: pull.foilType ?? (signed ? DEFAULT_FOIL_TYPE : null),
      signed,
      autograph: signed ? signature : null,
    };
  });
}
