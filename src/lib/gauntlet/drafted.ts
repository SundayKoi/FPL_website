// Drafted mode: play the hand you are dealt.
//
// The best five walk in every time, and the no-repeat rule only asks for
// one card to move. Drafted mode deals a HAND — a few random eligible
// cards per role from your own shelf — and the run is built from those.
// The board pays it a little more, because a run from a dealt hand is a
// harder, less solved run than a run from your best five.
//
// The deal is recorded server-side (gauntlet_deals) so the entry can
// check the five came from it; a hand is one run's, used once.

import type { GauntletOption } from "./queries";
import { GAUNTLET_ROLES, type GauntletRole } from "./sim";

/** Cards dealt per role. */
export const DRAFTED_HAND_PER_ROLE = 3;

/** What the board pays a drafted run: its weighted score times this. */
export const DRAFTED_SCORE_MULT = 1.15;

/** A hand: up to DRAFTED_HAND_PER_ROLE inventory ids per role, drawn
 *  without replacement off `rand`. A role with fewer cards than that
 *  deals what it has; a role with none deals nothing (a trialist plays). */
export function dealHand(
  options: Record<GauntletRole, Pick<GauntletOption, "inventoryId">[]>,
  rand: () => number,
): number[] {
  const ids: number[] = [];
  for (const role of GAUNTLET_ROLES) {
    const pool = [...(options[role] ?? [])];
    for (let n = 0; n < DRAFTED_HAND_PER_ROLE && pool.length > 0; n += 1) {
      const index = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
      ids.push(pool.splice(index, 1)[0].inventoryId);
    }
  }
  return ids;
}

/** Whether every fielded card came from the hand (trialists are free). */
export function lineupFromHand(fielded: (number | null)[], hand: number[]): boolean {
  const dealt = new Set(hand);
  return fielded.every((id) => id === null || dealt.has(id));
}
