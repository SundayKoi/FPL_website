import type { Metadata } from "next";
import Link from "next/link";
import CardsGate, { PREMIUM_GATE_BODY, PREMIUM_GATE_TITLE } from "@/components/cards/CardsGate";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import SeasonEndCommercePanel from "@/components/cards/SeasonEndCommercePanel";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchSeasonEndCatalog, fetchSeasonEndOwnedCopies, fetchSeasonEndReleaseById, fetchPublishedSeasonEndReleases } from "@/lib/season-end/release-queries";
import { fetchSeasonEndMarket } from "@/lib/season-end/commerce-queries";
import type { CardLeague } from "@/lib/cards/queries";

export const metadata: Metadata = {
  title: "Season’s End Market — FPL",
  description: "Buy, sell, dust and trade Season’s End collectible copies.",
};

export async function SeasonEndMarketView({ league = "premier", releaseId }: { league?: CardLeague; releaseId?: string } = {}) {
  const base = league === "academy" ? "/academy/cards" : "/cards";
  const user = await getBettingUser();
  if (!user) return <CardsGate section="Season's End market" title="Sign in to use the collectible market" body="Season's End commerce uses your betting wallet and Discord identity." signIn={`${base}/season-end/market`} />;
  if (!user.allowed) return <CardsGate section="Season's End market" title={PREMIUM_GATE_TITLE} body={PREMIUM_GATE_BODY} browse={`${base}/browse`} />;

  const service = createBettingServiceClient();
  const releases = await fetchPublishedSeasonEndReleases(service, league);
  const release = releaseId ? await fetchSeasonEndReleaseById(service, releaseId, { publicOnly: true }) : releases[0] ?? null;
  if (!release || release.league !== league) return <main className="page-container page-spacing flex w-full flex-1 flex-col gap-4 text-white"><p className="label-dash text-gold">Season&apos;s End market</p><h1 className="type-display text-4xl">No public release</h1><p className="text-steel">Community commerce opens after an exact release revision is published.</p></main>;
  const [catalog, copies, market] = await Promise.all([
    fetchSeasonEndCatalog(service, release),
    fetchSeasonEndOwnedCopies(service, release.id, user.discordId),
    fetchSeasonEndMarket(service, release.id, user.discordId),
  ]);
  if (!catalog) return null;
  return (
    <main className="page-container page-spacing bg-hash flex w-full flex-1 flex-col gap-8 text-white">
      <CardsPageHeader eyebrow={cardsEyebrow("Season's End market", league, release.season)} title="The collectible trading post">
        Public copies have their own market boundary. Listings, wanted offers, direct trades and dust all operate on frozen Season&apos;s End copies; they never enter the weekly player-card economy.
      </CardsPageHeader>
      <div className="flex flex-wrap gap-3 text-sm text-steel"><Link href={`${base}/season-end?release=${encodeURIComponent(release.id)}`} className="text-coral underline-offset-4 hover:underline">← Collection</Link><span>Release revision {release.catalogVersion} · {release.revisionDigest.slice(0, 16)}</span>{releases.length > 1 ? <span>{releases.length} published revisions available from the collection</span> : null}</div>
      <SeasonEndCommercePanel base={base} releaseId={release.id} catalog={catalog} copies={copies} market={market} viewerId={user.discordId} />
    </main>
  );
}

export default async function SeasonEndMarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return SeasonEndMarketView({ league: "premier", releaseId: typeof params.release === "string" ? params.release : undefined });
}
