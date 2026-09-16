// What a copy's edition line says.
//
// Every copy carries the Monday of the week it was minted in, and for a
// player card that week IS the print: "Aug 24 edition" is the roster and
// the ratings it froze. A champions relic is not from a week — the
// Faceless Drop mints last season's champions whenever the vault is
// open — so the Monday it happened to be opened on is a timestamp, not
// an edition, and printing it made the relic look like one week's card.
//
// A send-off print is the third case. It IS from a week, but the week is
// not what it is: "Aug 31 edition" says nothing, where "Send-off ·
// Champion" says everything (src/lib/cards/sendoff.ts).

import type { PlayerCardData } from "./build";
import { sendoffEditionLabel } from "./sendoff";
import { editionLabel } from "@/lib/packs/week";

export const RELIC_EDITION_LABEL = "Faceless Drop";

/** "Aug 24 edition" for a print, "Send-off · Champion" for a playoff print,
 *  "Faceless Drop" for a champions relic. */
export function copyEditionLabel(
  editionWeek: string | null | undefined,
  /** The frozen card, or — for a row that never carried the json — a
   *  plain "is this a relic" flag. */
  card?: Pick<PlayerCardData, "champWin" | "sendoff"> | boolean | null,
): string {
  const relic = typeof card === "boolean" ? card : Boolean(card?.champWin);
  if (relic) return RELIC_EDITION_LABEL;
  const sendoff = typeof card === "boolean" ? null : card?.sendoff ?? null;
  if (sendoff) return sendoffEditionLabel(sendoff.stage);
  return editionWeek ? editionLabel(editionWeek) : "";
}
