// The expeditions page's header: where you are, and two sentences on what
// the page is for. Everything else a first-time reader needs is on the
// board itself — the guide, the steps and the Terms — and the ledger link
// that used to sit here lives in the Graveyard tab. Hook-free, so the live
// page and the staff preview render the same header on the server.

import CardsPageHeader, { cardsEyebrow } from "../CardsPageHeader";
import type { CardLeague } from "@/lib/cards/queries";

export const EXPEDITIONS_INTRO =
  "Send three cards out on a route and answer them when they stop to ask what to do. They come home with betting dollars, and sometimes changed for good.";

export default function ExpeditionsHeader({ league, season, base }: { league: CardLeague; season: string | null; base: string }) {
  return (
    <CardsPageHeader eyebrow={cardsEyebrow("Play", league, season)} title="Expeditions" tabHref={`${base}/play`}>
      {EXPEDITIONS_INTRO}
    </CardsPageHeader>
  );
}
