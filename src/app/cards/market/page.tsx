import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import ListCardForm from "@/components/cards/ListCardForm";
import MarketBoard, { type BoardListing } from "@/components/cards/MarketBoard";
import MyListings, { type MyListing } from "@/components/cards/MyListings";
import type { TradeCardOption } from "@/components/cards/TradeBuilder";
import WantsBoard, { type BoardWant } from "@/components/cards/WantsBoard";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import { LISTING_DAYS } from "@/lib/market/config";
import {
  fetchListingsBySeller,
  fetchOpenListings,
  fetchOpenWants,
  fetchWantablePlayers,
  type MarketListing,
} from "@/lib/market/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { isAltArt } from "@/lib/trades/queries";

export const metadata: Metadata = {
  title: "Card Market — FPL",
  description: "Buy and sell player card copies for betting dollars.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * A listing flattened for the client boundary — the frozen card json stays
 * behind.
 *
 * The trade inbox ships its json because a trade names at most forty copies.
 * A board has no such ceiling: it is every listing in the league, and almost
 * none of them get opened. The rows carry enough to be scanned, and
 * `fetchInventoryCardAction` fetches the one card somebody actually looks at.
 */
function toBoardListing(listing: MarketListing): BoardListing {
  return {
    id: listing.id,
    sellerDiscordId: listing.sellerDiscordId,
    sellerUsername: listing.sellerUsername,
    ask: listing.ask,
    note: listing.note,
    expiresAt: listing.expiresAt,
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
        }
      : null,
  };
}

function toMyListing(listing: MarketListing): MyListing {
  return {
    id: listing.id,
    ask: listing.ask,
    note: listing.note,
    status: listing.status,
    expiresAt: listing.expiresAt,
    buyerUsername: listing.buyerUsername,
    stale: listing.stale,
    copy: toBoardListing(listing).copy,
  };
}

/**
 * The market: copies for sale, bounties waiting, and the two forms that write
 * them.
 *
 * Gated on FPL Better rather than the premium card role, same as the trading
 * post — every row here is priced in betting dollars, so the wallet is the
 * thing you need to be party to one.
 *
 * Every read goes through the service client: card_listings, card_wants and
 * card_inventory all have RLS on with no policies, and the Discord id comes
 * from the session, so this page can only ever ask for the signed-in
 * collector's own side of the board.
 */
export async function MarketPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card market</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to buy and sell cards</h1>
        <p className="max-w-md text-sm text-steel">
          The market moves copies for betting dollars, so it rides on your FPL Better wallet — sign in
          with Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}/market`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  if (!user.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card market</span>
        <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
        <p className="max-w-md text-sm text-steel">
          Every price on the market is in betting dollars, and only FPL Better members have a wallet to
          spend. Join the FPL Better role in Discord and come back to start dealing.
        </p>
      </main>
    );
  }

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

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Market</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Put a copy up at a fixed price and anyone can take it — no haggling, no waiting for an
            answer. A listing stands for {LISTING_DAYS} days. The wanted board is the same market from
            the other side: post a bounty on a card you need, and whoever holds one can sell it to you
            at that price.
          </p>
          <Link
            href={base}
            className="mt-3 inline-block text-xs text-steel underline-offset-4 hover:text-coral hover:underline"
          >
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/market" />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">For sale</h2>
        <MarketBoard listings={listings.map(toBoardListing)} viewerDiscordId={user.discordId} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Sell a card</h2>
        <ListCardForm inventory={myInventory} deployedIds={deployedIds} listedIds={listedIds} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Your listings</h2>
        <MyListings listings={mine.map(toMyListing)} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Wanted</h2>
        <WantsBoard
          wants={boardWants}
          players={players}
          myInventory={myInventory}
          viewerDiscordId={user.discordId}
          league={league}
          unavailableIds={unavailableIds}
        />
      </section>
    </main>
  );
}

export default async function MarketPage() {
  return MarketPageView({ league: "premier" });
}
