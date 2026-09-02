import type { Metadata } from "next";
import CardsGallery from "@/components/cards/CardsGallery";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";

export const metadata: Metadata = {
  title: "All Players — FPL",
  description: "Every player in the league as a living trading card, rated from this season's stats.",
};

/** The wall of every player's card — what "Player Cards" always meant,
 *  given its own page so it opens at the top instead of five panels down
 *  the hub. Same premium gate as the hub. */
export async function BrowsePageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const access = await drafterAccess();
  if (!access.signedIn) {
    return (
      <CardsGate
        section="Browse"
        title="Sign in to browse the cards"
        body="Player cards are a perk for premium Discord members — sign in with Discord to check your access."
        signIn={`${base}/browse`}
      />
    );
  }
  if (!access.allowed) {
    return <CardsGate section="Browse" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} />;
  }

  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const cards = season ? await fetchCurrentWeekCards(supabase, season) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Browse", league, season)} title="All players">
        The whole league as living trading cards — overall rating, tier, archetype, and form, rebuilt from
        real season stats after every match night. Hover to tilt, click to flip, and open a card to share
        it straight into Discord.
      </CardsPageHeader>
      {cards.length === 0 ? (
        <p className="text-sm text-steel">No rated players yet — cards appear once this season&apos;s first games are ingested.</p>
      ) : (
        <CardsGallery cards={cards} />
      )}
    </main>
  );
}

export default async function BrowsePage() {
  return BrowsePageView({ league: "premier" });
}
