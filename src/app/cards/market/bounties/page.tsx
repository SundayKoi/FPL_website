import type { Metadata } from "next";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import CardsPageHeader, { cardsBase, cardsEyebrow } from "@/components/cards/CardsPageHeader";
import RulesPanel from "@/components/site/RulesPanel";
import { MAX_OPEN_WANTS } from "@/lib/market/config";
import WantsBoard from "@/components/cards/WantsBoard";
import type { CardLeague } from "@/lib/cards/queries";
import { loadMarket } from "../load";

export const metadata: Metadata = {
  title: "Bounties — FPL",
  description: "Post a bounty on a card you need, or fill one from your shelf.",
};

/** The market's buying side: the wanted board. Same loader as Listings, so
 *  what a copy may do is the same answer on both tabs. */
export async function BountiesPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const market = await loadMarket(league);

  if (market.kind === "signed-out") {
    return (
      <CardsGate
        section="Market"
        title="Sign in to post or fill a bounty"
        body="Bounties are paid in betting dollars, so they ride on your wallet — sign in with Discord to check your access."
        signIn={`${base}/market/bounties`}
      />
    );
  }
  if (market.kind === "denied") {
    return <CardsGate section="Market" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} browse={`${base}/browse`} />;
  }

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Market", league, market.season)} title="Bounties" tabHref={`${cardsBase(league)}/market`}>
        The market from the other side: post a bounty on a card you need, and whoever holds one can sell
        it to you at that price. Holding a card somebody wants? Fill their bounty from your shelf.
      </CardsPageHeader>

      <RulesPanel
        items={[
          "Post a bounty on a card you want, at the price you will pay. Nothing is taken from your wallet until someone fills it.",
          `You can have ${MAX_OPEN_WANTS} bounties open at once, and you can withdraw one any time before it is filled.`,
          "Holding a card somebody wants? Fill their bounty straight from your shelf and the dollars are yours at once.",
          "A copy on an expedition or in a fantasy lineup still being scored cannot be used to fill a bounty.",
        ]}
      />

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Wanted</h2>
        <WantsBoard
          wants={market.wants}
          players={market.players}
          myInventory={market.myInventory}
          viewerDiscordId={market.discordId}
          league={league}
          unavailableIds={market.unavailableIds}
        />
      </section>
    </main>
  );
}

export default async function BountiesPage() {
  return BountiesPageView({ league: "premier" });
}
