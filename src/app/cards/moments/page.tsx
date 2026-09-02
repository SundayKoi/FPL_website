import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import MomentWall from "@/components/cards/MomentWall";
import { fetchCardSeason, fetchSeasonMoments, type CardLeague } from "@/lib/cards/queries";
import { MOMENTS_PER_WEEK, MOMENT_PULL_CHANCE } from "@/lib/cards/moments";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Moments — FPL",
  description: "The rarest single-game performances of the season, minted as cards.",
};

/** Public, unlike the rest of the card hub: a moment is something that
 *  happened in a league match, and the wall is the league's highlight reel. */
export async function MomentsPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const supabase = await createServerSupabase();
  const season = await fetchCardSeason(supabase, league);
  const moments = season ? await fetchSeasonMoments(supabase, season) : [];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            {league === "academy" ? "Academy" : "Premier"} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Moments</h1>
          <hr className="accent-rule mt-4 w-40 sm:w-56" />
          <p className="mt-3 max-w-2xl text-sm text-muted">
            A player card is a season average, which is exactly what buries the one night someone went
            off. These are the other half — one game, the real stat line, the date it happened. At most{" "}
            {MOMENTS_PER_WEEK} mint per week, and only the rarest of what actually happened. Each one can
            only be pulled from a pack bought for the week it happened in, at roughly{" "}
            {Math.round(MOMENT_PULL_CHANCE * 100)}% a pack.
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-muted underline-offset-4 hover:text-primary hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/moments" />
      </header>

      <MomentWall moments={moments} season={season} />
    </main>
  );
}

export default async function MomentsPage() {
  return MomentsPageView({ league: "premier" });
}
