import type { Metadata } from "next";
import CardsGallery from "@/components/cards/CardsGallery";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "All Players — FPL",
  description: "Every player in the league as a living trading card, rated from this season's stats.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

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
      <header>
        <span className="label-dash">
          Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
        </span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">All players</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          The whole league as living trading cards — overall rating, tier, archetype, and form, rebuilt
          from real season stats after every match night. Hover to tilt, click to flip, and open a card
          to share it straight into Discord.
        </p>
      </header>
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
