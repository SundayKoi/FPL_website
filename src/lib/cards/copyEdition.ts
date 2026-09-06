// What a copy's edition line says.
//
// Every copy carries the Monday of the week it was minted in, and for a
// player card that week IS the print: "Aug 24 edition" is the roster and
// the ratings it froze. A champions relic is not from a week — the
// Faceless Drop mints last season's champions whenever the vault is
// open — so the Monday it happened to be opened on is a timestamp, not
// an edition, and printing it made the relic look like one week's card.

import type { PlayerCardData } from "./build";
import { editionLabel } from "@/lib/packs/week";

export const RELIC_EDITION_LABEL = "Faceless Drop";

/** "Aug 24 edition" for a print; "Faceless Drop" for a champions relic. */
export function copyEditionLabel(
  editionWeek: string | null | undefined,
  /** The frozen card, or — for a row that never carried the json — a
   *  plain "is this a relic" flag. */
  card?: Pick<PlayerCardData, "champWin"> | boolean | null,
): string {
  const relic = typeof card === "boolean" ? card : Boolean(card?.champWin);
  if (relic) return RELIC_EDITION_LABEL;
  return editionWeek ? editionLabel(editionWeek) : "";
}
