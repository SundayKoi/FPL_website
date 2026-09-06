import type { Metadata } from "next";
import TeamCardsSection from "@/components/cards/TeamCardsSection";
import { fetchCardSeason, fetchCurrentWeekCards, fetchLatestGameWeek, fetchTeamIdentity, type CardLeague } from "@/lib/cards/queries";
import { createServerSupabase } from "@/lib/supabase/server";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";

export const metadata: Metadata = {
  title: "Team cards — FPL",
  description: "Every roster as a composite card, rated by its five best players.",
};

/** The team-card collection on its own page, so it isn't buried under
 *  the full player grid. Public, like every page under Browse. */
export async function TeamCardsPageView({ league = "premier" }: { league?: CardLeague }) {
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const [cards, identity, week] = season
    ? await Promise.all([
        fetchCurrentWeekCards(supabase, season),
        fetchTeamIdentity(supabase, season),
        fetchLatestGameWeek(supabase, season),
      ])
    : [[], null, null];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Browse", league, season)} title="Team cards">
        Every roster as one card: five panels, one per role, each wearing that player&apos;s most-played
        champion and washed in the team&apos;s own colours. Team OVR is the average of its five best cards,
        so the frame upgrades as the roster levels up. ★ marks a player holding this week&apos;s Card of the
        Week.
      </CardsPageHeader>
      {cards.length === 0 ? (
        <p className="text-sm text-steel">No rated players yet — team cards appear once this season&apos;s first games are ingested.</p>
      ) : (
        <TeamCardsSection cards={cards} colors={identity?.colors} weekStart={week ?? ""} showHeading={false} />
      )}
    </main>
  );
}

export default async function TeamCardsPage() {
  return TeamCardsPageView({ league: "premier" });
}
