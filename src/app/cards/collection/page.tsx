import type { Metadata } from "next";
import Link from "next/link";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import { Suspense } from "react";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import CollectionSections, { CollectionSectionsFallback } from "./CollectionSections";
import SeasonEndOwnedCollection from "./SeasonEndOwnedCollection";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchOrCreateOwnBinder, type Binder } from "@/lib/binder/queries";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchDailyRipStatus, type DailyRipStatus } from "@/lib/packs/queries";

export const metadata: Metadata = {
  title: "My Collection — FPL",
  description: "Every card you own, your binder, and your team sets.",
};


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
  view = "weekly",
}: {
  league?: CardLeague;
  view?: "weekly" | "season-end";
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
    return (
      <CardsGate
        section="My collection"
        title={PREMIUM_GATE_TITLE}
        body={PREMIUM_GATE_BODY}
        browse={`${base}/browse`}
        note="If you held cards before, they are still here — nothing is dusted, traded or lost while the role is off. It all opens again the moment it is back."
      />
    );
  }

  const service = createBettingServiceClient();
  const season = view === "weekly" ? await fetchCardSeason(service, league) : null;
  const [binder, dailyRip]: [Binder | null, DailyRipStatus] = view === "weekly" && season
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
      <CardsPageHeader eyebrow={view === "season-end" ? `My Collection · ${league === "academy" ? "Academy" : "Premier"} · Season's End` : cardsEyebrow("My Collection", league, season)} title="My Collection" glossary>
        Your weekly prints and Season&apos;s End pulls, collected in one place. Choose a collection below to see the copies you own.
      </CardsPageHeader>

      <nav aria-label="Choose a collection" className="flex flex-wrap gap-2">
        <Link href={`${base}/collection`} aria-current={view === "weekly" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${view === "weekly" ? "border-coral bg-coral text-navy" : "border-line text-steel hover:border-coral hover:text-white"}`}>Weekly cards</Link>
        <Link href={`${base}/collection?view=season-end`} aria-current={view === "season-end" ? "page" : undefined} className={`rounded-full border px-4 py-2 text-sm font-semibold ${view === "season-end" ? "border-coral bg-coral text-navy" : "border-line text-steel hover:border-coral hover:text-white"}`}>Season&apos;s End</Link>
      </nav>

      {view === "season-end" ? (
        <SeasonEndOwnedCollection service={service} discordId={user.discordId} league={league} base={base} />
      ) : (
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
      )}
    </main>
  );
}

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ setWeek?: string; view?: string }>;
}) {
  const { setWeek, view } = await searchParams;
  return CollectionPageView({ league: "premier", setWeek, view: view === "season-end" ? "season-end" : "weekly" });
}
