import type { Metadata } from "next";
import { Suspense } from "react";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import CollectionSections, { CollectionSectionsFallback } from "./CollectionSections";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchOrCreateOwnBinder, type Binder } from "@/lib/binder/queries";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDailyRipStatus, type DailyRipStatus } from "@/lib/packs/queries";

export const metadata: Metadata = {
  title: "My Collection — FPL",
  description: "Every card you own, your binder, and your team sets.",
};

const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

/**
 * The shelf: every copy the viewer owns, the roster sets those copies
 * complete, and the binder they can put six of them in.
 *
 * This used to be the bottom half of the pack shop, which is where nobody
 * looking for "my cards" thought to look. The reads are the shop's:
 * getBettingUser() for who is asking (dusting and pinning need the wallet
 * side of the account anyway), then the service client for the collection,
 * because card_inventory has no public read policy and the Discord id came
 * from the session.
 */
export async function CollectionPageView({
  league = "premier",
  setWeek,
}: {
  league?: CardLeague;
  /** ?setWeek= — which edition the roster sets open on. Sets are
   *  open-ended, so a collector can go back for a week they finished
   *  later; the newest week they hold copies from is the default. */
  setWeek?: string;
} = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();

  if (!user) {
    return (
      <CardsGate
        section="My collection"
        title="Sign in to see your cards"
        body="Your collection is tied to your Discord account — sign in to open it."
        signIn={`${base}/collection`}
      />
    );
  }
  if (!user.allowed) {
    return <CardsGate section="My collection" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} />;
  }

  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const [binder, dailyRip]: [Binder | null, DailyRipStatus] = season
    ? await Promise.all([
        // null when the card_binders migration hasn't been applied here —
        // the section is skipped rather than 500ing the whole page.
        fetchOrCreateOwnBinder(service, user.discordId),
        // Patron status and flame, for the shelf's re-roll die and glow.
        fetchDailyRipStatus(service, user.discordId),
      ])
    : [null, { left: 0, patron: false, flame: null }];

  return (
    <main className="bg-hash mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <header>
        <span className="label-dash">
          Premium · {LEAGUE_LABELS[league]} · Season {season ?? "—"}
        </span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">My Collection</h1>
        <p className="mt-3 max-w-2xl text-sm text-steel">
          Every copy you own, one shelf per player with the best print on top. Open a player&apos;s
          prints to see each copy, dust a spare, or pin one to your binder. Roster sets and the binder
          are further down.
        </p>
      </header>

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

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string }>;
}) {
  const { setWeek } = await searchParams;
  return CollectionPageView({ league: "premier", setWeek });
}
