// The slim projection the cards hub hands to the ClaimFinder search box.
// Lives outside the "use client" component on purpose: the hub (a server
// component) calls it while building props, and every export of a client
// module is a client *reference* on the server — calling one throws at
// runtime (React error #441). Keeping the pure data mapping here lets both
// sides share it.
import type { PlayerCardData } from "@/lib/cards/build";

/** All the finder needs of a card: enough to match a name and to tell two
 *  players of the same name apart on screen. */
export interface ClaimFinderCard {
  slug: string;
  name: string;
  role: string;
  teamName: string | null;
}

/** Keeps the serialized banner payload to four fields per card instead of a
 *  second copy of the collection the gallery already ships. */
export function toClaimFinderCards(cards: PlayerCardData[]): ClaimFinderCard[] {
  return cards.map((card) => ({
    slug: card.slug,
    name: card.name,
    role: card.role,
    teamName: card.teamName,
  }));
}
