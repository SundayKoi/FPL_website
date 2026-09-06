import type { Metadata } from "next";
import Link from "next/link";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import ClaimFinder from "@/components/cards/ClaimFinder";
import PlayerCard3D from "@/components/cards/PlayerCard3D";
import ThisWeekStrip from "@/components/cards/ThisWeekStrip";
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
import { fetchCardEditionWeeks, fetchCardSeason, fetchCurrentWeekCards, type CardLeague } from "@/lib/cards/queries";
import { cardsSections } from "@/lib/cards/sections";
import { fetchBettingUsernames } from "@/lib/fantasy/queries";
import { drafterAccess } from "@/lib/match-draft/access";
import { WEEKLY_DRAW_POT } from "@/lib/packs/config";
import { fetchChase, fetchDailyRipStatus, fetchLiveWindow, type DailyRipStatus } from "@/lib/packs/queries";
import { weekNotices } from "@/lib/packs/weekNotices";
import { createServerSupabase } from "@/lib/supabase/server";
import PatronPerks from "@/components/patron/PatronPerks";

export const metadata: Metadata = {
  title: "Cards — FPL",
  description: "Your card, your shelf, and what's happening in the card game this week — a premium member perk.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/** "Aug 24" — the draw week is a plain calendar date, printed as UTC so no
 *  reader's timezone slides it back onto the wrong Sunday. */
function monthDay(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return weekStart;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const NO_RIP: DailyRipStatus = { left: 0, patron: false, flame: null };

/**
 * The service-client reads Home needs about the viewer and the week: the
 * draw winner's display name (betting_profiles), the viewer's copy count
 * (card_inventory — every copy is a draw ticket, so one number serves
 * both lines), whether today's free rip is still there, and this week's
 * chase. None of those tables has a public read grant.
 *
 * Strictly read-only, and deliberately NOT getBettingUser(): that call runs
 * grant_signup_bonus, which would create a wallet and credit a signup bonus
 * as a side effect of merely loading the hub, and re-sync username/avatar on
 * every visit. A read-only page must not write. The viewer's Discord id is
 * resolved by the caller from profiles instead, and a viewer with no betting
 * profile simply counts zero copies.
 *
 * Fails soft: an environment with no SUPABASE_SERVICE_ROLE_KEY configured
 * (createBettingServiceClient throws outright) renders the page with the
 * winner's id and no shelf line rather than 500ing the hub.
 */
async function loadHomeExtras(
  latest: DrawRow | null,
  season: string | null,
  newestWeek: string | null,
  viewerDiscordId: string | null,
): Promise<{ copies: number; winnerName: string | null; rip: DailyRipStatus; chase: Awaited<ReturnType<typeof fetchChase>> }> {
  try {
    const service = createBettingServiceClient();
    const [names, copies, rip, chase] = await Promise.all([
      latest ? fetchBettingUsernames(service, [latest.discordId]) : Promise.resolve(new Map<string, string>()),
      viewerDiscordId && season ? fetchTicketCount(service, viewerDiscordId, season) : Promise.resolve(0),
      viewerDiscordId ? fetchDailyRipStatus(service, viewerDiscordId) : Promise.resolve(NO_RIP),
      newestWeek ? fetchChase(service, newestWeek) : Promise.resolve(null),
    ]);
    return {
      copies,
      winnerName: latest ? names.get(latest.discordId) ?? latest.discordId : null,
      rip,
      chase,
    };
  } catch (error) {
    // Silently swallowing this leaves a misconfigured service key looking
    // exactly like a league where nobody owns anything.
    console.error("cards: home lookups failed", error);
    return { copies: 0, winnerName: latest?.discordId ?? null, rip: NO_RIP, chase: null };
  }
}

/**
 * Cards Home. It used to be the wall of every player's card with a
 * thirteen-link menu above it and your own card somewhere in the middle.
 * The wall is Browse now. This page is about you and this week: your card,
 * your shelf, today's free pack, the chase, the draw — and then a line on
 * each tab so the words are met with their meaning.
 *
 * Gated by the premium role, like everything that claims, buys, trades or
 * fields a card. Browse (every player, team, moment, the Vault, Compare)
 * and the per-card share pages are public: the collection is the
 * advertisement, and the gate points at it.
 */
export async function CardsPageView({ league = "premier" }: { league?: CardLeague }) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const access = await drafterAccess();
  if (!access.signedIn) {
    return (
      <CardsGate
        section="Cards"
        title="Sign in to see the card collection"
        body="Your own card, packs, the market and the games are for premium Discord members — sign in with Discord to check your access."
        signIn={base}
        browse={`${base}/browse`}
      />
    );
  }
  if (!access.allowed) {
    return <CardsGate section="Cards" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} browse={`${base}/browse`} />;
  }

  const supabase = await createServerSupabase();
  const [season, viewerResult] = await Promise.all([
    fetchCardSeason(supabase, league),
    supabase.auth.getUser().then((result) => result, () => ({ data: { user: null } })),
  ]);
  const viewerProfileId = viewerResult.data.user?.id ?? null;

  // The claim is the thing a player is most likely here to do: their own
  // card. One read for the whole page, and every failure (migration not
  // applied, two claims in a season) reads as "no claim", whose strip is
  // the harmless one. The viewer's Discord id comes from profiles (public
  // read policy) on the cookie-bound client — a plain select, so loading
  // the hub writes nothing. The cards themselves are read only for the
  // claim finder, which needs the names to search.
  const [cards, claimResult, latestDraw, viewerProfileResult, editionWeeks, liveWindow] = await Promise.all([
    season ? fetchCurrentWeekCards(supabase, season) : Promise.resolve([]),
    viewerProfileId && season
      ? supabase
          .from("card_claims")
          .select("summoner_name, tag, status")
          .eq("profile_id", viewerProfileId)
          .eq("season", season)
          .limit(1)
          .maybeSingle()
          .then((result) => result.data, () => null)
      : Promise.resolve(null),
    season ? fetchLatestDraw(supabase, season) : Promise.resolve(null),
    viewerProfileId
      ? supabase
          .from("profiles")
          .select("discord_id")
          .eq("id", viewerProfileId)
          .maybeSingle()
          .then((result) => result.data, () => null)
      : Promise.resolve(null),
    season ? fetchCardEditionWeeks(supabase, season) : Promise.resolve([] as string[]),
    fetchLiveWindow(supabase),
  ]);
  const myClaim = claimResult as { summoner_name: string; tag: string; status: "pending" | "approved" } | null;
  const mySlug = myClaim ? cardSlug(myClaim.summoner_name, myClaim.tag) : null;
  const viewerDiscordId = (viewerProfileResult as { discord_id: string | null } | null)?.discord_id ?? null;

  const { copies, winnerName, rip, chase } = await loadHomeExtras(latestDraw, season, editionWeeks[0] ?? null, viewerDiscordId);
  const drawPanel = drawPanelState(latestDraw, viewerDiscordId);
  // Home is a menu as much as a page: no Faceless banners here, those are
  // the shop's business.
  const notices = weekNotices({ liveWindow, chase, championsWindow: null, championComps: 0 });
  const tabs = cardsSections(base).filter((section) => section.key !== "home");

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">
          Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
        </span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">Cards</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          Every player in the league as a living trading card, rated from this season&apos;s stats. Collect
          them from packs, put them to work, and show them off.
        </p>
      </header>

      {/* You first: your card, or the claim that makes one yours. */}
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

      {/* Your shelf in one line, and whether today's free pack is still there. */}
      {viewerDiscordId ? (
        <section aria-label="Your shelf" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-5 py-3">
          <p className="text-sm text-white">
            {copies > 0 ? (
              <>
                You hold <b className="font-semibold">{copies.toLocaleString()}</b> {copies === 1 ? "copy" : "copies"}.
              </>
            ) : (
              <>You hold no cards yet.</>
            )}{" "}
            <span className="text-steel">
              {rip.left > 0
                ? `Today's free pack is waiting${rip.patron && rip.left > 1 ? ` — ${rip.left} of them, patron` : ""}.`
                : "Today's free pack is opened — the next one comes tomorrow."}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {rip.left > 0 ? (
              <Link href={`${base}/packs`} className="btn-coral px-5 py-2 text-sm">
                Rip it →
              </Link>
            ) : (
              // The free pack is gone, but the shop is not: without this the
              // only link left pointed at a collection that might be empty.
              <Link href={`${base}/packs`} className="btn-pill px-5 py-2 text-sm">
                Buy a pack →
              </Link>
            )}
            <Link
              href={`${base}/collection`}
              className="text-xs font-semibold uppercase tracking-wide text-steel transition hover:text-coral"
            >
              My collection →
            </Link>
          </div>
        </section>
      ) : null}

      {viewerDiscordId && copies === 0 ? (
        <section aria-label="Getting started" className="grid gap-3 rounded-lg border border-line bg-panel px-5 py-4 sm:grid-cols-3">
          <div>
            <span className="label-dash">1 · Rip a pack</span>
            <p className="mt-1 text-sm text-steel">
              One is free every day. Five cards a pack; every player in the league is in the set, rated from this
              season&apos;s games.
            </p>
            <Link href={`${base}/packs`} className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-coral">
              Packs →
            </Link>
          </div>
          <div>
            <span className="label-dash">2 · Keep the good ones</span>
            <p className="mt-1 text-sm text-steel">
              Your collection is the shelf. Dust spares back into dollars, or set an auto-dust rule and let it tidy
              itself.
            </p>
            <Link href={`${base}/collection`} className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-coral">
              My collection →
            </Link>
          </div>
          <div>
            <span className="label-dash">3 · Put them to work</span>
            <p className="mt-1 text-sm text-steel">
              Field five in Fantasy, trade on the market, or sit down at a Showdown table. Every copy is also a ticket
              in the weekly draw.
            </p>
            <Link href={`${base}/play`} className="mt-2 inline-block text-xs font-semibold uppercase tracking-wide text-coral">
              Play →
            </Link>
          </div>
        </section>
      ) : null}

      <ThisWeekStrip notices={notices} />

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
          <span className="label-dash">Weekly Draw</span>
          <p className="type-display mt-1 text-xl sm:text-2xl">{drawPanel.headline}</p>
          <p className="mt-1 max-w-xl text-sm text-steel">
            {DRAW_TAGLINE} This week&apos;s pot is {fmtPoints(WEEKLY_DRAW_POT)} and a free pack.
            {latestDraw
              ? drawPanel.isWinner
                ? ` Week of ${monthDay(latestDraw.weekStart)} — that one was yours.`
                : ` Week of ${monthDay(latestDraw.weekStart)} — ${winnerName} held the ticket.`
              : ""}
          </p>
          {viewerDiscordId ? (
            <p className="mt-2 text-sm text-white">
              {copies > 0 ? (
                <>
                  Every copy is a ticket — you hold <b className="font-semibold">{copies.toLocaleString()}</b>.
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

      {/* What's where: one line per tab, so nobody has to click five things
          to learn what they are. */}
      <section aria-labelledby="whats-where">
        <h2 id="whats-where" className="label-dash">
          What&apos;s where
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <Link
                href={tab.href}
                className="card-brand group flex h-full flex-col gap-1 p-4 transition hover:border-coral focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                <span className="type-display text-lg text-white group-hover:text-coral">{tab.label} →</span>
                <span className="text-xs leading-5 text-steel">{tab.blurb}</span>
                {tab.children ? (
                  <span className="mt-1 text-[11px] text-steel/80">{tab.children.map((child) => child.label).join(" · ")}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Most of what patronage buys is a CARD perk, so the short list
          belongs here, under the collection it decorates — not only on the
          support desk, where collectors never go. */}
      <PatronPerks variant="compact" />
    </main>
  );
}

export default async function CardsPage() {
  return CardsPageView({ league: "premier" });
}
