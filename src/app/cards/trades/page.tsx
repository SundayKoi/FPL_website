import type { Metadata } from "next";
import Link from "next/link";
import TradeBuilder, { type TradeCardOption } from "@/components/cards/TradeBuilder";
import TradeInbox, { type InboxTrade } from "@/components/cards/TradeInbox";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDeployedCopyIds } from "@/lib/expeditions/queries";
import { fetchInventory } from "@/lib/packs/queries";
import { fetchCollectors, fetchTradesFor, isAltArt, type TradeCard, type TradeRow } from "@/lib/trades/queries";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";

export const metadata: Metadata = {
  title: "Trade offers — FPL",
  description: "Trade player cards and betting dollars with other collectors.",
};

/**
 * A hydrated trade card as the inbox takes it — frozen `card` json and all.
 *
 * That json used to be dropped here, back when a chip was the end of the
 * story. It isn't: the inbox now opens the actual copy on click, and only the
 * frozen card knows which skin it printed in and what the ink looks like.
 * The size is bounded by the trades themselves — 30 trades × 20 cards a side
 * is the ceiling, and a real inbox is a fraction of that.
 */
function toInboxCard(card: TradeCard) {
  return {
    id: card.id,
    playerName: card.playerName,
    overall: card.overall,
    tier: card.tier,
    editionWeek: card.editionWeek,
    foil: card.foil,
    signed: card.signed,
    altArt: card.altArt,
    card: card.card,
    stale: card.stale,
  };
}

function toInboxTrade(trade: TradeRow): InboxTrade {
  return {
    id: trade.id,
    fromDiscordId: trade.fromDiscordId,
    fromUsername: trade.fromUsername,
    toDiscordId: trade.toDiscordId,
    toUsername: trade.toUsername,
    offered: trade.offered.map(toInboxCard),
    requested: trade.requested.map(toInboxCard),
    offeredDollars: trade.offeredDollars,
    requestedDollars: trade.requestedDollars,
    status: trade.status,
    stale: trade.stale,
  };
}

/**
 * The trading post: offers in, offers out, and the form that writes new ones.
 *
 * Gated on the wallet rather than the premium-role check, same as /cards/packs
 * — a trade can carry betting dollars, so the wallet is the thing you need to
 * be party to one.
 *
 * Every read goes through the service client: card_inventory and card_trades
 * both have RLS on with no policies (see src/lib/trades/queries.ts), and the
 * Discord id comes from the session, so this page can only ever ask for the
 * signed-in collector's trades.
 */
export async function TradesPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Trade offers</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to trade cards</h1>
        <p className="max-w-md text-sm text-steel">
          Trades move cards and betting dollars between collectors, so they ride on your
          wallet — sign in with Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}/trades`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  if (!user.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Trade offers</span>
        <h1 className="type-display text-3xl sm:text-4xl">Premium members only</h1>
        <p className="max-w-md text-sm text-steel">
          Trades can carry betting dollars, and only premium members have a wallet to spend. Grab the
          premium role in the Discord and come back to start dealing.
        </p>
      </main>
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [trades, collectors, inventory] = season
    ? await Promise.all([
        fetchTradesFor(service, user.discordId, season),
        fetchCollectors(service, season),
        fetchInventory(service, user.discordId, season),
      ])
    : [{ incoming: [], outgoing: [] }, [], []];
  // Copies away on an expedition — season-blind, because the deploy lock
  // belongs to the card. The builder greys them; accept_card_trade would be
  // refused by card_inventory_expedition_guard anyway, but not until the
  // other side had already been sent an offer that could never settle.
  const deployedIds = await fetchDeployedCopyIds(service, user.discordId);

  // Your own shelf ships its frozen cards with it, so the builder can preview
  // anything you might offer without a round trip. A collection is under ~100
  // copies; the partner's side, which has no such ceiling, is fetched one card
  // at a time instead (fetchInventoryCardAction).
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

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Market", league, season)} title="Trade offers">
        Trade cards and betting dollars with other collectors — either side of an offer can be cards,
        money, or both. Nothing moves until the other person accepts, and a card fielded in this
        week&apos;s fantasy lineup can&apos;t be traded until the week is scored.
      </CardsPageHeader>
      <TradeInbox
        incoming={trades.incoming.map(toInboxTrade)}
        outgoing={trades.outgoing.map(toInboxTrade)}
        viewerDiscordId={user.discordId}
      />

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">New trade</h2>
        <TradeBuilder
          collectors={collectors}
          myInventory={myInventory}
          viewerDiscordId={user.discordId}
          league={league}
          deployedIds={deployedIds}
        />
      </section>
    </main>
  );
}

export default async function TradesPage() {
  return TradesPageView({ league: "premier" });
}
