// The market's read side, shared by its two pages.
//
// Listings and Bounties are the same market from two sides, and they read
// the same things: who is asking, the season, the boards, the collector's
// own shelf (to sell from, or to fill a bounty from) and what on that shelf
// is spoken for. One loader, so the two pages cannot drift apart on what a
// copy is allowed to do.
//
// Gated on the wallet rather than the premium-role check — every row here
// is priced in betting dollars, so the wallet is the thing you need to be
// party to one. Every read goes through the service client: card_listings,
// card_wants and card_inventory all have RLS on with no policies, and the
// Discord id comes from the session, so a page can only ever ask for the
// signed-in collector's own side of the board.

import type { BoardListing } from "@/components/cards/MarketBoard";
import type { MyListing } from "@/components/cards/MyListings";
import type { TradeCardOption } from "@/components/cards/TradeBuilder";
import type { BoardWant } from "@/components/cards/WantsBoard";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import {
  fetchListingsBySeller,
  fetchOpenListings,
  fetchOpenWants,
  fetchWantablePlayers,
  type MarketListing,
  type WantablePlayer,
} from "@/lib/market/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { isAltArt } from "@/lib/trades/queries";

/**
 * A listing flattened for the client boundary — the frozen card json stays
 * behind.
 *
 * The trade inbox ships its json because a trade names at most forty copies.
 * A board has no such ceiling: it is every listing in the league, and almost
 * none of them get opened. The rows carry enough to be scanned, and
 * `fetchInventoryCardAction` fetches the one card somebody actually looks at.
 */
export function toBoardListing(listing: MarketListing): BoardListing {
  return {
    id: listing.id,
    sellerDiscordId: listing.sellerDiscordId,
    sellerUsername: listing.sellerUsername,
    ask: listing.ask,
    note: listing.note,
    expiresAt: listing.expiresAt,
    createdAt: listing.createdAt,
    stale: listing.stale,
    copy: listing.copy
      ? {
          id: listing.copy.id,
          playerName: listing.copy.playerName,
          overall: listing.copy.overall,
          tier: listing.copy.tier,
          foil: listing.copy.foil,
          foilType: listing.copy.foilType,
          signed: listing.copy.signed,
          altArt: listing.copy.altArt,
          editionWeek: listing.copy.editionWeek,
          relic: Boolean(listing.copy.card?.champWin),
        }
      : null,
  };
}

export function toMyListing(listing: MarketListing): MyListing {
  return {
    id: listing.id,
    ask: listing.ask,
    note: listing.note,
    status: listing.status,
    expiresAt: listing.expiresAt,
    createdAt: listing.createdAt,
    buyerUsername: listing.buyerUsername,
    stale: listing.stale,
    copy: toBoardListing(listing).copy,
  };
}

export type MarketLoad =
  | { kind: "signed-out" }
  | { kind: "denied" }
  | {
      kind: "ok";
      discordId: string;
      season: string | null;
      listings: BoardListing[];
      mine: MyListing[];
      wants: BoardWant[];
      players: WantablePlayer[];
      myInventory: TradeCardOption[];
      deployedIds: Set<number>;
      listedIds: Set<number>;
      /** Deployed or already listed — a copy the sale RPC would refuse. */
      unavailableIds: Set<number>;
    };

export async function loadMarket(league: CardLeague): Promise<MarketLoad> {
  const user = await getBettingUser();
  if (!user) return { kind: "signed-out" };
  if (!user.allowed) return { kind: "denied" };

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [listings, mine, wants, players, inventory] = season
    ? await Promise.all([
        fetchOpenListings(service, season),
        fetchListingsBySeller(service, user.discordId, season),
        fetchOpenWants(service, season),
        fetchWantablePlayers(service, season),
        fetchInventory(service, user.discordId, season),
      ])
    : [[], [], [], [], []];

  // Copies away on an expedition — season-blind, because the deploy lock
  // belongs to the card. Listing one would put a card on the board that the
  // sale RPC refuses to transfer, discovered by whoever clicked Buy.
  const deployedIds = await fetchDeployedCopyIds(service, user.discordId);
  const listedIds = new Set(mine.filter((row) => row.status === "open").map((row) => row.inventoryId));
  const unavailableIds = new Set([...deployedIds, ...listedIds]);

  const myInventory: TradeCardOption[] = inventory.map((row) => ({
    id: row.id,
    slug: row.slug,
    playerName: row.playerName,
    role: row.role,
    overall: row.overall,
    tier: row.tier,
    foil: row.foil,
    signed: row.signed,
    altArt: isAltArt(row.card),
    editionWeek: row.editionWeek,
    card: row.card,
  }));

  // The want board stores a slug; a slug is not a name. Resolved against the
  // season's own cards, with the collector's shelf as a second source for a
  // player who has since dropped out of the edition.
  const names = new Map(players.map((player) => [player.slug, player.name]));
  for (const card of myInventory) if (!names.has(card.slug)) names.set(card.slug, card.playerName);
  const boardWants: BoardWant[] = wants.map((want) => ({
    id: want.id,
    discordId: want.discordId,
    username: want.username,
    slug: want.slug,
    playerName: names.get(want.slug) ?? want.slug,
    bounty: want.bounty,
    note: want.note,
    status: want.status,
    filledByUsername: want.filledByUsername,
  }));

  return {
    kind: "ok",
    discordId: user.discordId,
    season,
    listings: listings.map(toBoardListing),
    mine: mine.map(toMyListing),
    wants: boardWants,
    players,
    myInventory,
    deployedIds,
    listedIds,
    unavailableIds,
  };
}
