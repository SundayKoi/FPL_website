import type { Metadata } from "next";
import Link from "next/link";
import CardsGallery from "@/components/cards/CardsGallery";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import CardsNav from "@/components/cards/CardsNav";
import ClaimFinder from "@/components/cards/ClaimFinder";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import { fmtPoints } from "@/lib/betting/format";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { toClaimFinderCards } from "@/lib/cards/claimFinder";
import { cardSlug } from "@/lib/cards/build";
import {
  DRAW_TAGLINE,
  drawPanelState,
  fetchLatestDraw,
  fetchTicketCount,
  type DrawRow,
} from "@/lib/cards/draw-queries";
import { fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { fetchBettingUsernames } from "@/lib/fantasy/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { WEEKLY_DRAW_POT } from "@/lib/packs/config";
import { createServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Player Cards — FPL",
  description: "Living trading cards rated from the season's stats — a premium member perk.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** "Aug 24" — the draw week is a plain calendar date, printed as UTC so no
 *  reader's timezone slides it back onto the wrong Sunday. */
function monthDay(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The two service-client reads the Draw strip needs: the winner's display
 * name (betting_profiles) and the viewer's ticket count (card_inventory).
 * Neither table has a public read grant, and both are garnish on a page
 * whose job is the wall of cards.
 *
 * Strictly read-only, and deliberately NOT getBettingUser(): that call runs
 * grant_signup_bonus, which would create a wallet and credit a signup bonus
 * as a side effect of merely loading the hub, and re-sync username/avatar on
 * every visit. A read-only page must not write. The viewer's Discord id is
 * resolved by the caller from profiles instead, and a viewer with no betting
 * profile simply counts zero tickets.
 *
 * Fails soft: an environment with no SUPABASE_SERVICE_ROLE_KEY configured
 * (createBettingServiceClient throws outright) renders the strip with the
 * winner's id and no ticket line rather than 500ing the hub.
 */
async function loadDrawExtras(
  latest: DrawRow | null,
  season: string | null,
  viewerDiscordId: string | null,
): Promise<{ tickets: number; winnerName: string | null }> {
  try {
    const service = createBettingServiceClient();
    const [names, tickets] = await Promise.all([
      latest ? fetchBettingUsernames(service, [latest.discordId]) : Promise.resolve(new Map<string, string>()),
      viewerDiscordId && season ? fetchTicketCount(service, viewerDiscordId, season) : Promise.resolve(0),
    ]);
    return {
      tickets,
      winnerName: latest ? names.get(latest.discordId) ?? latest.discordId : null,
    };
  } catch (error) {
    // Silently swallowing this leaves a misconfigured service key looking
    // exactly like a league where nobody owns anything.
    console.error("cards: weekly draw name/ticket lookup failed", error);
    return { tickets: 0, winnerName: latest?.discordId ?? null };
  }
}

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
  const cards = season ? await fetchCurrentWeekCards(supabase, season) : [];

  // The thing a player is most likely here to do, and until now the hardest
  // to find: their own card. One read for the whole page — never one per
  // card — and every failure (signed-out edge, migration not applied, two
  // claims in a season) reads as "no claim", whose strip is the harmless one.
  const { data: viewer } = await supabase.auth.getUser().then((result) => result, () => ({ data: { user: null } }));
  const viewerProfileId = viewer.user?.id ?? null;
  const { data: claimRow } =
    viewerProfileId && season
      ? await supabase
          .from("card_claims")
          .select("summoner_name, tag, status")
          .eq("profile_id", viewerProfileId)
          .eq("season", season)
          .limit(1)
          .maybeSingle()
          .then((result) => result, () => ({ data: null }))
      : { data: null };
  const myClaim = claimRow as { summoner_name: string; tag: string; status: "pending" | "approved" } | null;
  const mySlug = myClaim ? cardSlug(myClaim.summoner_name, myClaim.tag) : null;

  // The Weekly Draw, compacted to one strip: the copy that came up last,
  // this week's pot, and how many tickets the viewer is holding.
  //
  // The viewer's Discord id comes from profiles (public read policy, and
  // the same profile id the claim lookup above already resolved) on the
  // cookie-bound client — a plain select, so loading the hub writes
  // nothing. Only weekly_draws reads publicly; the two locked-down reads
  // go through loadDrawExtras, which owns the service client.
  const latestDraw = season ? await fetchLatestDraw(supabase, season) : null;
  const { data: viewerProfile } = viewerProfileId
    ? await supabase
        .from("profiles")
        .select("discord_id")
        .eq("id", viewerProfileId)
        .maybeSingle()
        .then((result) => result, () => ({ data: null }))
    : { data: null };
  const drawViewerId = (viewerProfile as { discord_id: string | null } | null)?.discord_id ?? null;
  const { tickets: ticketCount, winnerName: drawWinnerName } = await loadDrawExtras(
    latestDraw,
    season,
    drawViewerId,
  );
  const drawPanel = drawPanelState(latestDraw, drawViewerId);

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
        <CardsLeagueToggle league={league} />
      </header>

      {/* Nine identical pills used to sit in the header, all shouting at the
          same volume. Grouped by what someone came here to do instead. */}
      <CardsNav base={base} />
      {/* Your card, before the wall of everyone else's. */}
      {myClaim && myClaim.status === "approved" && mySlug ? (
        <section className="card-brand flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <span className="label-dash">Yours to customize</span>
            <p className="type-display mt-1 text-xl sm:text-2xl">Your card — {myClaim.summoner_name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/card/${mySlug}?customize=1`} className="btn-coral px-5 py-2.5 text-sm">
              Customize your card →
            </Link>
            <Link
              href={`/card/${mySlug}`}
              className="text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-coral"
            >
              View →
            </Link>
          </div>
        </section>
      ) : null}
      {myClaim && myClaim.status === "pending" && mySlug ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-5 py-3">
          <p className="text-sm text-steel">
            Your claim on <span className="font-semibold text-white">{myClaim.summoner_name}</span> is waiting for a
            captain or admin.
          </p>
          <Link
            href={`/card/${mySlug}`}
            className="text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-coral"
          >
            View card →
          </Link>
        </section>
      ) : null}
      {/* The Weekly Draw. Every copy in a collection is a ticket, so this
          strip is as much about the viewer's shelf as about last week. */}
      <section className="card-brand flex flex-wrap items-center gap-5 px-5 py-4">
        {latestDraw ? (
          // The frozen snapshot with its laurel — never the living copy,
          // which its holder may have dusted since.
          <div className="w-28 shrink-0 sm:w-36">
            <PlayerCard3D card={latestDraw.card} interactive={false} className="!w-full" />
          </div>
        ) : null}
        <div className="min-w-[16rem] flex-1">
          <span className="label-dash">The Weekly Draw</span>
          <p className="type-display mt-1 text-xl sm:text-2xl">{drawPanel.headline}</p>
          <p className="mt-1 max-w-xl text-sm text-steel">
            {DRAW_TAGLINE} This week&apos;s pot is {fmtPoints(WEEKLY_DRAW_POT)} and a free pack.
            {latestDraw
              ? drawPanel.isWinner
                ? ` Week of ${monthDay(latestDraw.weekStart)} — that one was yours.`
                : ` Week of ${monthDay(latestDraw.weekStart)} — ${drawWinnerName} held the ticket.`
              : ""}
          </p>
          {drawViewerId ? (
            <p className="mt-2 text-sm text-white">
              {ticketCount > 0 ? (
                <>
                  You hold <b className="font-semibold">{ticketCount.toLocaleString()}</b> ticket
                  {ticketCount === 1 ? "" : "s"}.
                </>
              ) : (
                <>You hold no tickets yet — every card you open is one.</>
              )}
            </p>
          ) : null}
        </div>
        <Link
          href={`${base}/draw`}
          className="text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-coral"
        >
          Every winner →
        </Link>
      </section>
      {!myClaim && viewerProfileId && cards.length > 0 ? (
        <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-panel px-5 py-4">
          <div>
            <span className="label-dash">Claim your card</span>
            <p className="mt-1 max-w-md text-sm text-steel">
              Players own their cards here — find yours and claim it. Once a captain or admin confirms it&apos;s you,
              you pick the art, write the motto, and sign it.
            </p>
          </div>
          <ClaimFinder cards={toClaimFinderCards(cards)} />
        </section>
      ) : null}
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
