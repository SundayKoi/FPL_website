import type { Metadata } from "next";
import Link from "next/link";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
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

export const metadata: Metadata = {
  title: "Card Packs — FPL",
  description: "Spend betting dollars on packs of player cards and build a collection.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * The pack shop. Reads getBettingUser() rather than drafterAccess() because
 * packs are bought with betting dollars, so the wallet side of the account
 * has to exist — the role both checks look at is the same one.
 *
 * The collection this fills used to be the bottom half of this page. It is
 * its own tab now (/cards/collection): "my cards" and "buy cards" are
 * different questions, and nobody looking for the first guessed "Packs".
 */
export async function PacksPageView({ league = "premier" }: { league?: CardLeague } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <CardsGate
        section="Packs"
        title="Sign in to open packs"
        body="Packs are bought with betting dollars, so they ride on your wallet — sign in with Discord to check your access."
        signIn={`${base}/packs`}
      />
    );
  }

  if (!user.allowed) {
    return <CardsGate section="Packs" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} />;
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [ownedSlugs, openCount, editionWeeks, dailyRip]: [string[], number, string[], DailyRipStatus] = season
    ? await Promise.all([
        // Slugs, not the collection. The shop only asks "do I own this
        // player at all"; the shelf itself lives on its own tab.
        fetchOwnedSlugs(service, user.discordId, season),
        fetchPackOpenCount(service, user.discordId, season),
        fetchCardEditionWeeks(service, season),
        fetchDailyRipStatus(service, user.discordId),
      ])
    : [[], 0, [], { left: 0, patron: false, flame: null }];
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
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label-dash">
            Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
          </span>
          <h1 className="type-display mt-2 text-4xl sm:text-5xl">Card Packs</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel">
            Packs cost betting dollars and contain {PACK_SIZE} player cards, each frozen at this week&apos;s
            ratings — every card is stamped with the week it was pulled, so a player you open twice in
            different weeks is two different prints. Every copy comes printed in a random skin of that
            player&apos;s signature champion, and foils are a rare pull on any tier.
          </p>
        </div>
      </header>

      {liveWindow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-red-300">
            <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
            Live drops
          </span>
          <span className="text-sm text-white">{liveWindow.label}</span>
          <span className="text-xs text-steel">
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
            <span className="text-xs text-steel">The Faceless Pack button below won&apos;t charge you until they&apos;re spent.</span>
          ) : (
            <span className="text-xs text-steel">They unlock the moment the vault opens.</span>
          )}
        </div>
      ) : null}
      {championsWindow ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d61f2c]/60 bg-[#d61f2c]/10 px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#ff6b76]">🂡 The Faceless Drop</span>
          <span className="text-sm text-white">
            Season Four&apos;s champions as The Hand — K, A, Q, 7 and the Joker, one card per pack.
          </span>
          <span className="text-xs text-steel">
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
            <span className="text-xs text-steel">
              Taken by <span className="font-semibold text-white">{chase.claimedBy}</span>
            </span>
          ) : (
            <span className="text-xs text-steel">
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

      <p className="text-sm text-steel">
        Everything you pull lands in{" "}
        <Link href={`${base}/collection`} className="text-coral underline-offset-4 hover:underline">
          your collection
        </Link>
        .
      </p>
    </main>
  );
}

export default async function PacksPage() {
  return PacksPageView({ league: "premier" });
}
