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

import { SIGNED_CHANCE } from "./config";
import type { PackPull } from "./rng";

/** A pull with its autograph resolved. `autograph` is the signature PNG
 *  data URI to ink onto this copy, null on every unsigned pull. */
export type SignedPull = PackPull & { signed: boolean; autograph: string | null };

/**
 * Marks the signed copies in a rolled pack.
 *
 * `signaturesBySlug` maps a card slug (cardSlug(name, tag)) to that player's
 * signature. A pull whose player has no signature on file consumes NO rand
 * at all — an unsignable pack must not shift the sequence a signable one
 * would see, which is what makes the odds above readable and the tests
 * deterministic. Pulls that can roll consume exactly one value each.
 */
export function applyAutographs(
  pulls: PackPull[],
  signaturesBySlug: Map<string, string>,
  rand: () => number,
): SignedPull[] {
  return pulls.map((pull) => {
    const signature = signaturesBySlug.get(pull.card.slug);
    if (!signature) return { ...pull, signed: false, autograph: null };
    const signed = rand() < SIGNED_CHANCE;
    return { ...pull, signed, autograph: signed ? signature : null };
  });
}
