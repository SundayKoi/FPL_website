import type { Metadata } from "next";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import ListCardForm from "@/components/cards/ListCardForm";
import MarketBoard from "@/components/cards/MarketBoard";
import MyListings from "@/components/cards/MyListings";
import type { CardLeague } from "@/lib/cards/queries";
import { LISTING_DAYS } from "@/lib/market/config";
import { parseInventoryId } from "@/lib/cards/params";
import { loadMarket } from "./load";

export const metadata: Metadata = {
  title: "Listings — FPL",
  description: "Buy and sell player card copies for betting dollars.",
};

/** The market's selling side: copies for sale, the form that lists one, and
 *  your own listings. Bounties — the same market from the buying side — are
 *  the next sub-tab. */
export async function MarketPageView({
  league = "premier",
  sell,
}: {
  league?: CardLeague;
  /** ?sell=<inventory id> — open the sell form on this copy. */
  sell?: string;
} = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const market = await loadMarket(league);

  if (market.kind === "signed-out") {
    return (
      <CardsGate
        section="Market"
        title="Sign in to buy and sell cards"
        body="The market moves copies for betting dollars, so it rides on your wallet — sign in with Discord to check your access."
        signIn={`${base}/market`}
      />
    );
  }
  if (market.kind === "denied") {
    return <CardsGate section="Market" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} />;
  }

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Market", league, market.season)} title="Listings">
        Put a copy up at a fixed price and anyone can take it — no haggling, no waiting for an answer. A
        listing stands for {LISTING_DAYS} days. Looking for a card nobody has listed? Post a bounty on the
        next tab.
      </CardsPageHeader>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">For sale</h2>
        <MarketBoard listings={market.listings} viewerDiscordId={market.discordId} />
      </section>

      <section id="sell" className="scroll-mt-24 flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Sell a card</h2>
        <ListCardForm
          inventory={market.myInventory}
          deployedIds={market.deployedIds}
          listedIds={market.listedIds}
          initialInventoryId={parseInventoryId(sell)}
          base={base}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Your listings</h2>
        <MyListings listings={market.mine} />
      </section>
    </main>
  );
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ sell?: string }> }) {
  const { sell } = await searchParams;
  return MarketPageView({ league: "premier", sell });
}
