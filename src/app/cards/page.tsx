import type { Metadata } from "next";
import Link from "next/link";
import CardsGallery from "@/components/cards/CardsGallery";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchCardSeason, fetchSeasonCards, type CardLeague } from "@/lib/cards/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Player Cards — FPL",
  description: "Living trading cards rated from the season's stats — a premium member perk.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** The premium hub: every player's card for a league's current season.
 *  Gated by the same Discord premium role as the drafter; the per-card
 *  share pages stay public so cards can actually be flexed. Premier and
 *  Academy share this view — the two leagues differ only by season code. */
export async function CardsPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const access = await drafterAccess();
  if (!access.signedIn) {
    return (
      <main className="bg-hash flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Player cards</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to see the card collection</h1>
        <p className="max-w-md text-sm text-steel">
          Player cards are a perk for premium Discord members — sign in with Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}`} className="btn-pill mt-2">
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
  const season = await fetchCardSeason(supabase, league);
  const cards = season ? await fetchSeasonCards(supabase, season) : [];

  // Whether to point at the approvals queue. Working out if THIS viewer is a
  // captain of some roster costs a round trip per claim, so don't: admins
  // always get the link (with the backlog on it), and everyone else gets it
  // whenever any claim is pending. /cards/claims is the thing that knows what
  // each viewer may actually act on, and says "nothing" when that's the answer.
  const staffTier = await fetchStaffTier(supabase);
  const { count: pendingClaims } = season
    ? await supabase
        .from("card_claims")
        .select("season", { count: "exact", head: true })
        .eq("season", season)
        .eq("status", "pending")
        .then((result) => result, () => ({ count: null }))
    : { count: null };
  const showClaims = staffTier.isAdmin || (pendingClaims ?? 0) > 0;

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Player Cards</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            The whole league as living trading cards — overall rating, tier, archetype, and form, all
            computed from real season stats and rebuilt automatically after every match night. Hover to
            tilt, click to flip, and share your card straight into Discord.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CardsLeagueToggle league={league} />
          <Link
            href={`${base}/teams`}
            className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
          >
            Team cards →
          </Link>
          <Link
            href={`${base}/compare`}
            className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
          >
            Card vs Card →
          </Link>
          <Link
            href={`${base}/packs`}
            className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
          >
            Packs →
          </Link>
          <Link
            href={`${base}/trades`}
            className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
          >
            Trades →
          </Link>
          <Link
            href={`${base}/fantasy`}
            className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
          >
            Fantasy →
          </Link>
          {showClaims ? (
            <Link
              href="/cards/claims"
              className="rounded-full border border-coral/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-coral transition hover:bg-coral hover:text-navy"
            >
              Claims{(pendingClaims ?? 0) > 0 ? ` (${pendingClaims})` : ""} →
            </Link>
          ) : null}
        </div>
      </header>
      {cards.length === 0 ? (
        <p className="text-sm text-steel">No rated players yet — cards appear once this season&apos;s first games are ingested.</p>
      ) : (
        <CardsGallery cards={cards} />
      )}
    </main>
  );
}

export default async function CardsPage() {
  return CardsPageView({ league: "premier" });
}
