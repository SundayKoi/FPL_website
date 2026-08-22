import type { Metadata } from "next";
import Link from "next/link";
import CardsGallery from "@/components/cards/CardsGallery";
import { fetchCardSeason, fetchSeasonCards } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Player Cards — FPL",
  description: "Living trading cards rated from the season's stats — a premium member perk.",
};

/** The premium hub: every player's card for the current season. Gated by
 *  the same Discord premium role as the drafter; the per-card share pages
 *  stay public so cards can actually be flexed. */
export default async function CardsPage() {
  const access = await drafterAccess();
  if (!access.signedIn) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Player cards</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to see the card collection</h1>
        <p className="max-w-md text-sm text-steel">
          Player cards are a perk for premium Discord members — sign in with Discord to check your access.
        </p>
        <Link href="/login?redirect=/cards" className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }
  if (!access.allowed) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Player cards</span>
        <h1 className="type-display text-3xl sm:text-4xl">Premium members only</h1>
        <p className="max-w-md text-sm text-steel">
          Every player gets a living trading card — rating, tier, archetype, and form, rebuilt from the
          stats after every match night. Grab the premium role in the Discord to browse the collection.
          Card links you&apos;ve been sent still work without it.
        </p>
      </main>
    );
  }

  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase);
  const cards = season ? await fetchSeasonCards(supabase, season) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">Premium · Season {season ?? "—"}</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">Player Cards</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          The whole league as living trading cards — overall rating, tier, archetype, and form, all
          computed from real season stats and rebuilt automatically after every match night. Hover to
          tilt, click to flip, and share your card straight into Discord.
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
