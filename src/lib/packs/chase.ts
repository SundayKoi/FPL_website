// Does a pull satisfy the week's chase?
//
// Pure and tiny on purpose: WHO WAS FIRST is decided by the database
// (claim_card_chase's atomic update), so all this answers is "is this
// print even a candidate". Criteria are whatever subset of the fields an
// admin cared to pin; every present key must match, absent keys match
// anything, and an empty criteria object means the first pull of the week
// — any pull — takes it.

import { foilTypeOf } from "./config";

export interface ChaseCriteria {
  /** The player's card slug, e.g. "doug-na1". */
  slug?: string;
  /** Tier KEY ("diamond"), not label. */
  tier?: string;
  foil?: boolean;
  /** Implies foil; "ice" etc. Matched through foilTypeOf so a legacy foil
   *  with no stored parallel counts as the prisma it is. */
  foilType?: string;
  signed?: boolean;
}

export interface ChaseCandidate {
  card: { slug: string; tier: { key: string }; moment?: unknown };
  foil: boolean;
  /** Loose string, as stored: legacy copies carry null and the matcher
   *  narrows through foilTypeOf itself. */
  foilType: string | null;
  signed?: boolean;
}

export function matchesChase(pull: ChaseCandidate, criteria: ChaseCriteria): boolean {
  // A moment replacing the last slot is its own event, never the chase —
  // a chase for "any pull" being eaten by a 2% moment would steal both
  // stories at once.
  if (pull.card.moment) return false;
  if (criteria.slug !== undefined && pull.card.slug !== criteria.slug) return false;
  if (criteria.tier !== undefined && pull.card.tier.key !== criteria.tier) return false;
  if (criteria.foil !== undefined && pull.foil !== criteria.foil) return false;
  if (criteria.foilType !== undefined) {
    if (!pull.foil || foilTypeOf(pull.foilType) !== criteria.foilType) return false;
  }
  if (criteria.signed !== undefined && Boolean(pull.signed) !== criteria.signed) return false;
  return true;
}
