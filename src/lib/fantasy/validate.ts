// The rules a fantasy lineup has to satisfy, as one pure function.
//
// Shared by the client builder (live feedback while picking) and the server
// action (the ruling that actually counts) — which is the whole reason it
// lives here with no Supabase or React in sight. The action must never trust
// the client's copy of this verdict; it re-runs it against rows it fetched
// itself.

import { FANTASY_ROLES, SALARY_CAP, type FantasyRole } from "./config";

/** The fields of an owned copy (InventoryRow, src/lib/packs/queries.ts) the
 *  rules actually read. Deliberately a subset: the validator has no business
 *  knowing about foils, art, or acquisition time. */
export interface LineupCard {
  id: number;
  slug: string;
  playerName: string;
  /** The card's own position — one of FANTASY_ROLES for any real card. */
  role: string;
  /** The copy's frozen edition rating; what the salary cap is spent on. */
  overall: number;
}

/** One chosen card and the slot it was chosen for. */
export interface LineupSlotInput {
  role: FantasyRole;
  inventory: LineupCard;
}

export type LineupVerdict = { ok: true; totalOverall: number } | { ok: false; error: string };

export interface ValidateLineupOptions {
  /** Override the cap — exists for tests and a future variant format. */
  salaryCap?: number;
}

/**
 * Checks a proposed lineup and returns either its total OVR or the first
 * problem, phrased for the user (these strings are shown verbatim).
 *
 * Order is deliberate: completeness first (an empty form should say "fill
 * it in", not complain about the cap), then per-card legality, then the cap
 * — the cap message quotes a total, which is only meaningful once the five
 * cards are known to be a legal five.
 */
export function validateLineup(slots: LineupSlotInput[], opts: ValidateLineupOptions = {}): LineupVerdict {
  const cap = opts.salaryCap ?? SALARY_CAP;

  const byRole = new Map<FantasyRole, LineupCard>();
  for (const slot of slots) {
    // A repeated slot is the same failure as a missing one — the lineup
    // doesn't have exactly one card in every role.
    if (byRole.has(slot.role)) return { ok: false, error: "Fantasy lineups need one card in every role." };
    byRole.set(slot.role, slot.inventory);
  }
  if (byRole.size !== FANTASY_ROLES.length || FANTASY_ROLES.some((role) => !byRole.has(role))) {
    return { ok: false, error: "Fantasy lineups need one card in every role." };
  }

  for (const role of FANTASY_ROLES) {
    const card = byRole.get(role)!;
    if (card.role !== role) {
      return { ok: false, error: `${card.playerName} is a ${card.role} card — it can't play ${role}.` };
    }
  }

  const seen = new Map<string, string>();
  for (const role of FANTASY_ROLES) {
    const card = byRole.get(role)!;
    // Slug, not inventory id: two editions of the same player are different
    // copies but the same human, and one human can only play one position.
    if (seen.has(card.slug)) return { ok: false, error: `You can't field two copies of ${card.playerName}.` };
    seen.set(card.slug, card.playerName);
  }

  const totalOverall = FANTASY_ROLES.reduce((sum, role) => sum + byRole.get(role)!.overall, 0);
  if (totalOverall > cap) {
    return { ok: false, error: `Lineup is over the salary cap: ${totalOverall}/${cap}.` };
  }

  return { ok: true, totalOverall };
}
