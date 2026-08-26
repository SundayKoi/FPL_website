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
  /** The role printed on the card ("Jungle"), matched case-insensitively.
   *  Composes with any preset — "any foil jungle card" is {foil, role},
   *  which is exactly the chase title that taught us titles must not
   *  promise what criteria don't check. */
  role?: string;
}

export interface ChaseCandidate {
  card: { slug: string; tier: { key: string }; role?: string; moment?: unknown };
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
  if (criteria.role !== undefined && (pull.card.role ?? "").toLowerCase() !== criteria.role.toLowerCase()) return false;
  return true;
}

/** The role words as printed on cards — what a role criterion may pin. */
export const CHASE_ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

/** "jungle" / " JUNGLE " -> "Jungle"; anything else -> null. */
export function chaseRoleOf(raw: string | undefined): string | null {
  const wanted = raw?.trim().toLowerCase();
  if (!wanted) return null;
  return CHASE_ROLES.find((role) => role.toLowerCase() === wanted) ?? null;
}

/** The arm-the-chase form's preset list — one honest sentence per option,
 *  so an admin never hand-writes jsonb. */
export const CHASE_PRESETS = ["any", "foil", "ice", "signed", "player", "tier"] as const;
export type ChasePreset = (typeof CHASE_PRESETS)[number];

/**
 * Preset (+ its parameter, when it takes one) -> criteria. Returns null
 * for a parameterised preset missing its parameter, which the form treats
 * as "not ready to arm" rather than arming an accidental match-anything.
 */
export function chaseCriteriaFromPreset(
  preset: ChasePreset,
  parameter?: string,
): ChaseCriteria | null {
  switch (preset) {
    case "any":
      return {};
    case "foil":
      return { foil: true };
    case "ice":
      return { foilType: "ice" };
    case "signed":
      return { signed: true };
    case "player": {
      const slug = parameter?.trim().toLowerCase();
      return slug ? { slug } : null;
    }
    case "tier": {
      const tier = parameter?.trim().toLowerCase();
      return tier ? { tier } : null;
    }
  }
}
