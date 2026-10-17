// Offseason packs: the tournament's own cards, a fresh set each week, opened
// with a weekly allowance that has nothing to do with the league's wallet.
// offseason_open_pack (20261112000001_offseason_packs.sql) holds the
// authoritative numbers and odds; these mirror them for the page.

import type { PlayerCardData } from "@/lib/cards/build";
import type { OffseasonView } from "./view";

export const PACK_PRICE = 100;
export const WEEKLY_ALLOWANCE = 2000;
export const PACK_SIZE = 5;
/** The one foil finish offseason cards come in. */
export const OFFSEASON_FOIL_TYPE = "prisma";
/** Per card: foil, shiny, and signed (only players with a saved autograph; always foil). */
export const ODDS = { foil: 1 / 10, shiny: 1 / 20, signed: 1 / 20 } as const;

/** One pulled copy, as the page shows it. */
export interface OffseasonCopy {
  id: number;
  weekNumber: number;
  foil: boolean;
  shiny: boolean;
  signed: boolean;
  card: PlayerCardData;
}

/**
 * A week's set: every player with a rated game, as their card stands now
 * (cumulative over the event, like their Overall). Frozen without finishes:
 * the pack rolls foil, shiny and signed per copy.
 */
export function buildCardSet(view: OffseasonView): { entrant_id: string; card: PlayerCardData }[] {
  return view.entrants.flatMap((entrant) => {
    const card = view.ratings.get(entrant.id)?.card;
    if (!card) return [];
    return [{ entrant_id: entrant.id, card: { ...card, season: "Offseason", shiny: null, autograph: null } }];
  });
}
