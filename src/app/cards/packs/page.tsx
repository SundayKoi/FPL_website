import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import CardsLeagueToggle from "@/components/cards/CardsLeagueToggle";
import CollectionSections, { CollectionSectionsFallback } from "./CollectionSections";
import PackShop from "@/components/cards/PackShop";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchPatronTenureDays } from "@/lib/patron/queries";
import { fetchCardEditionWeeks, fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { PACK_COST, PACK_SIZE } from "@/lib/packs/config";
import {
  fetchChampionsWindow,
  fetchChase,
  fetchDailyRipStatus,
  fetchLiveWindow,
  fetchOwnedSlugs,
  fetchPackComps,
  fetchPackOpenCount,
  type ChaseBanner,
  type DailyRipStatus,
  type LiveWindow,
} from "@/lib/packs/queries";
import { fetchOrCreateOwnBinder, type Binder } from "@/lib/binder/queries";

export const metadata: Metadata = {
  title: "Card Packs — FPL",
  description: "Spend betting dollars on packs of player cards and build a collection.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * The pack counter and the collection it fills. Gated on FPL Better rather
 * than the premium card role — packs are bought with betting dollars, so the
 * wallet is the thing you need — which is why this page reads
 * getBettingUser() instead of drafterAccess() like the rest of /cards.
 *
 * Inventory reads go through the service client: card_inventory has no
 * public RLS policy (src/lib/packs/queries.ts), and the Discord id is taken
 * from the session, so nobody can ask for someone else's shelf.
 */
export async function PacksPageView({
  league = "premier",
  setWeek,
}: {
  league?: CardLeague;
  /** ?setWeek= — which edition the roster sets are asked of. Sets are
   *  open-ended, so a collector can go back for a week they finished
   *  later; the newest week they hold copies from is the default. */
  setWeek?: string;
} = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card packs</span>
        <h1 className="type-display text-3xl sm:text-4xl">Sign in to open packs</h1>
        <p className="max-w-md text-sm text-muted">
          Packs are bought with betting dollars, so they ride on your FPL Better wallet — sign in with
          Discord to check your access.
        </p>
        <Link href={`/login?redirect=${base}/packs`} className="btn-pill mt-2">
          Sign in with Discord
        </Link>
      </main>
    );
  }

  if (!user.allowed) {
    return (
      <main className="page-backdrop flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
        <span className="label-dash">Card packs</span>
        <h1 className="type-display text-3xl sm:text-4xl">FPL Better members only</h1>
        <p className="max-w-md text-sm text-muted">
          Packs are paid for with betting dollars, and only FPL Better members have a wallet to spend.
          Join the FPL Better role in Discord and come back to start a collection.
        </p>
      </main>
    );
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [ownedSlugs, openCount, editionWeeks, binder, dailyRip]: [string[], number, string[], Binder | null, DailyRipStatus] = season
    ? await Promise.all([
        // Slugs, not the collection. The shop only asks "do I own this
        // player at all", and the shelf that needs every copy is suspended
        // below so it cannot hold the buy buttons up.
        fetchOwnedSlugs(service, user.discordId, season),
        fetchPackOpenCount(service, user.discordId, season),
        fetchCardEditionWeeks(service, season),
        // null when the card_binders migration hasn't been applied here —
        // the section is skipped rather than 500ing the whole page.
        fetchOrCreateOwnBinder(service, user.discordId),
        fetchDailyRipStatus(service, user.discordId),
      ])
    : [[], 0, [], null, { left: 0, patron: false, flame: null }];
  // The banners above the shop: an open Live Drops window and this week's
  // chase. The chase is pinned to the NEWEST edition, matching the week a
  // pack mints by default — and it is league-wide, so the academy shop
  // shows (and academy pulls can win) the same one as premier.
  let [liveWindow, chase, championsWindow, championComps, standardComps]: [
    LiveWindow | null,
    ChaseBanner | null,
    { until: string } | null,
    number,
    number,
  ] = [null, null, null, 0, 0];
  // The shop's own banners, plus the patron tenure the wardrobe needs.
  // Both are small and neither waits on a collection any more.
  const [shopReads, patronTenureDays] = await Promise.all([
    season
      ? Promise.all([
          fetchLiveWindow(service),
          editionWeeks[0] ? fetchChase(service, editionWeeks[0]) : Promise.resolve(null),
          // The Faceless Drop is a premier relic — the academy shop never
          // sells it.
          league === "premier" ? fetchChampionsWindow(service) : Promise.resolve(null),
          // The Champion's Tribute — free Faceless Packs for the S4 squad.
          league === "premier" ? fetchPackComps(service, user.discordId, "champions") : Promise.resolve(0),
          // Free shop packs — the Weekly Draw's prize. Not league-gated: the
          // comp is held per person, and either shop's pack spends it.
          fetchPackComps(service, user.discordId, "standard"),
        ])
      : Promise.resolve([null, null, null, 0, 0] as const),
    // Tenure unlocks the Sovereign flame in the wardrobe — only worth a
    // read for an active patron.
    dailyRip.patron ? fetchPatronTenureDays(service, user.discordId) : Promise.resolve(0),
  ]);
  [liveWindow, chase, championsWindow, championComps, standardComps] = shopReads;

  return (
    <main className="page-backdrop mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Packs</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            Packs cost betting dollars and contain {PACK_SIZE} player cards, each frozen at this week&apos;s
            ratings — every card is stamped with the week it was pulled, so a player you open twice in
            different weeks is two different prints. Every copy comes printed in a random skin of that
            player&apos;s signature champion, and foils are a rare pull on any tier.
          </p>
          <Link href={base} className="mt-3 inline-block text-xs text-muted underline-offset-4 hover:text-action-text hover:underline">
            ← Back to player cards
          </Link>
        </div>
        <CardsLeagueToggle league={league} suffix="/packs" />
      </header>

      {liveWindow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-red-300">
            <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
            Live drops
          </span>
          <span className="text-sm text-white">{liveWindow.label}</span>
          <span className="text-xs text-muted">
            Foil odds boosted until{" "}
            {new Date(liveWindow.until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })}{" "}
            ET · every card stamped LIVE
          </span>
        </div>
      ) : null}
      {championComps > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-[#ffb08a]/70 bg-gradient-to-r from-[#d61f2c]/25 to-[#d61f2c]/5 px-4 py-3">
          <span className="text-sm font-black uppercase tracking-[0.14em] text-[#ffb08a]">🏆 Champion&apos;s Tribute</span>
          <span className="text-sm text-white">
            You were part of the S4 Faceless squad — {championComps} free Faceless Pack{championComps === 1 ? "" : "s"}{" "}
            {championComps === 1 ? "is" : "are"} yours, on the house.
          </span>
          {championsWindow ? (
            <span className="text-xs text-muted">The Faceless Pack button below won&apos;t charge you until they&apos;re spent.</span>
          ) : (
            <span className="text-xs text-muted">They unlock the moment the vault opens.</span>
          )}
        </div>
      ) : null}
      {championsWindow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d61f2c]/60 bg-[#d61f2c]/10 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff6b76]">🂡 The Faceless Drop</span>
          <span className="text-sm text-white">
            Season Four&apos;s champions as The Hand — K, A, Q, 7 and the Joker, one card per pack.
          </span>
          <span className="text-xs text-muted">
            Vault shuts{" "}
            {new Date(championsWindow.until).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })}{" "}
            — then what was pulled is all there will ever be.
          </span>
        </div>
      ) : null}
      {chase ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-[0.14em] text-gold">★ This week&apos;s chase</span>
          <span className="text-sm text-white">{chase.title}</span>
          {chase.claimedBy ? (
            <span className="text-xs text-muted">
              Taken by <span className="font-semibold text-white">{chase.claimedBy}</span>
            </span>
          ) : (
            <span className="text-xs text-muted">
              First to pull it{chase.bounty > 0 ? ` wins ${chase.bounty} betting dollars and` : ""} takes the CHASE stamp
            </span>
          )}
        </div>
      ) : null}

      <PackShop
        league={league}
        balance={user.balance}
        packCost={PACK_COST}
        openCount={openCount}
        // What's already on the shelf, so the opening can mark a pull NEW.
        // Slugs only: the overlay asks "do I own this player at all", which
        // an inventory row's own slug answers without shipping the cards.
        ownedSlugs={ownedSlugs}
        // Every archived week stays on sale, so a card from an earlier week
        // is always still obtainable.
        editionWeeks={editionWeeks}
        dailyRipsLeft={dailyRip.left}
        patron={dailyRip.patron}
        flame={dailyRip.flame}
        championsOpen={Boolean(championsWindow)}
        championComps={championComps}
        standardComps={standardComps}
        patronTenureDays={patronTenureDays}
      />

      {/* Suspended on purpose: this is the collection, the roster sets and
          the binder, and it is the only part of the page that has to read
          every copy somebody owns. The shop above is already interactive
          while this arrives. */}
      <Suspense fallback={<CollectionSectionsFallback />}>
        <CollectionSections
          discordId={user.discordId}
          season={season}
          base={base}
          binder={binder}
          patron={dailyRip.patron}
          flame={dailyRip.flame}
          setWeek={setWeek}
        />
      </Suspense>

    </main>
  );
}

export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string }>;
}) {
  const { setWeek } = await searchParams;
  return PacksPageView({ league: "premier", setWeek });
}
