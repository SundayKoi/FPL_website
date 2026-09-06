import type { Metadata } from "next";
import CardsGallery from "@/components/cards/CardsGallery";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";

export const metadata: Metadata = {
  title: "All Players — FPL",
  description: "Every player in the league as a living trading card, rated from this season's stats.",
};

/** The wall of every player's card — what "Player Cards" always meant,
 *  given its own page so it opens at the top instead of five panels down
 *  the hub. PUBLIC, like the rest of Browse: the cards are the league's
 *  own players, and the wall is the advertisement for everything behind
 *  the gate. Everything it reads is anon-readable; nothing on it can be
 *  claimed, customised, bought or fielded — those doors stay premium. */
export async function BrowsePageView({ league = "premier" }: { league?: CardLeague } = {}) {
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
