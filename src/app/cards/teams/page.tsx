import type { Metadata } from "next";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import TeamCardsSection from "@/components/cards/TeamCardsSection";
import { fetchCardSeason, fetchCurrentWeekCards, fetchLatestGameWeek, fetchTeamIdentity, type CardLeague } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Team Cards — FPL",
  description: "Every roster as a composite card, rated by its five best players.",
};

/** Premium (same gate as the hub): the team-card collection on its own
 *  page, so it isn't buried under the full player grid. */
export async function TeamCardsPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const access = await drafterAccess();
  if (!access.signedIn || !access.allowed) {
    return (
      <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Team cards</span>
        <h1 className="type-display text-3xl sm:text-4xl">Premium members only</h1>
        <p className="max-w-md text-sm text-muted">
          Team cards are part of the premium card collection.
          {access.signedIn ? " Grab the premium role in the Discord to browse them." : " Sign in with Discord to check your access."}
        </p>
        {!access.signedIn && (
          <Link href={`/login?redirect=${base}/teams`} className="btn-pill mt-2">
            Sign in with Discord
          </Link>
        )}
      </main>
    );
  }

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
    <main className="page-backdrop mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {league === "academy" ? "Academy" : "Premier"} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Team Cards</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Every roster as one card: five panels, one per role, each wearing that player&apos;s most-played
            champion and washed in the team&apos;s own colours. Team OVR is the average of its five best
            cards, so the frame upgrades as the roster levels up. ★ marks a player holding this week&apos;s
            Card of the Week.
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-muted underline-offset-4 hover:text-action-text hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/teams" />
      </header>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">No rated players yet — team cards appear once this season&apos;s first games are ingested.</p>
      ) : (
        <TeamCardsSection cards={cards} colors={identity?.colors} weekStart={week ?? ""} showHeading={false} />
      )}
    </main>
  );
}

export default async function TeamCardsPage() {
  return TeamCardsPageView({ league: "premier" });
}
