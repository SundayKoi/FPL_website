import Link from "next/link";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchSeasonEndCatalog, fetchSeasonEndOwnedCopies, fetchSeasonEndReleaseById, fetchPublishedSeasonEndReleases, type SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";
import type { CardLeague } from "@/lib/cards/queries";
import { groupSeasonEndDesigns } from "@/lib/season-end/overview";

export async function SeasonEndCollectionView({ league, releaseId }: { league: CardLeague; releaseId?: string }) {
  const service = createBettingServiceClient();
  const published = await fetchPublishedSeasonEndReleases(service, league);
  const release = releaseId
    ? await fetchSeasonEndReleaseById(service, releaseId, { publicOnly: true })
    : published[0] ?? null;
  const scopedRelease = release && release.league === league ? release : null;
  let catalog: Awaited<ReturnType<typeof fetchSeasonEndCatalog>> = null;
  let catalogError = false;
  if (scopedRelease) {
    try {
      catalog = await fetchSeasonEndCatalog(service, scopedRelease);
    } catch {
      catalogError = true;
    }
  }
  const user = await getBettingUser();
  const ownedCopies: SeasonEndOwnedCopy[] = scopedRelease && user
    ? await fetchSeasonEndOwnedCopies(service, scopedRelease.id, user.discordId)
    : [];
  if (!scopedRelease || !catalog) {
    return <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10 text-white"><p className="label-dash text-gold">Season&apos;s End</p><h1 className="type-display text-4xl">{catalogError ? "Release integrity check failed" : "The collection is not published yet"}</h1><p className="text-steel">{catalogError ? "This frozen release could not be verified. Staff must inspect the stored catalog before it can be shown." : "Staff testing must finish before this release appears in the public collection."}</p></main>;
  }

  const copiesByDesign = new Map<string, SeasonEndOwnedCopy[]>();
  for (const copy of ownedCopies) copiesByDesign.set(copy.designId, [...(copiesByDesign.get(copy.designId) ?? []), copy]);
  const preview = (design: typeof catalog.designs[number]) => ({ design, foil: false, foilType: null, signed: false, autograph: null, guaranteedFoil: false, inventoryId: 0 });
  const groups = groupSeasonEndDesigns(catalog.designs);
  const base = league === "academy" ? "/academy/cards" : "/cards";
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Season's End", league, scopedRelease.season)} title="Season&apos;s End collection">
        The published season in cards: award winners, Best of Champions, and cumulative Season Cards. Owned variants sit beneath each base design, so duplicates do not inflate the checklist.
      </CardsPageHeader>
      <div className="flex flex-wrap items-center gap-3 text-sm text-steel">
        <span>Release revision {scopedRelease.catalogVersion} · {scopedRelease.paused ? "paused for purchases" : "published"}</span>
        <Link href={`${base}/season-end/market?release=${encodeURIComponent(scopedRelease.id)}`} className="text-gold underline-offset-4 hover:underline">Market, trades &amp; dust →</Link>
        <Link href={`${base}/packs?release=${encodeURIComponent(scopedRelease.id)}`} className="text-coral underline-offset-4 hover:underline">Open this release →</Link>
      </div>
      {published.length > 1 ? <nav aria-label="Season's End releases" className="flex flex-wrap gap-2 text-xs">{published.map((entry) => <Link key={entry.id} href={`${base}/season-end?release=${encodeURIComponent(entry.id)}`} className={`rounded-full border px-3 py-1 ${entry.id === scopedRelease.id ? "border-gold text-gold" : "border-line text-steel"}`}>{entry.season} · revision {entry.catalogVersion}</Link>)}</nav> : null}
      <p className="text-sm text-steel">Owned base designs: <span className="text-gold">{copiesByDesign.size}/{catalog.designs.length}</span> · rules {scopedRelease.rulesVersion} · digest <code className="text-xs text-gold">{scopedRelease.revisionDigest.slice(0, 16) || scopedRelease.catalogHash.slice(0, 16)}</code></p>
      <nav aria-label="Season's End card groups" className="flex flex-wrap gap-2 text-sm">
        {groups.map((group) => <a key={group.id} href={`#${group.id}`} className="rounded-full border border-line px-4 py-2 hover:border-gold">{group.title} · {group.designs.length}</a>)}
      </nav>
      {groups.map((group) => <section key={group.id} id={group.id} aria-label={group.title} className="scroll-mt-8">
        <h2 className="type-display mb-5 border-b border-line pb-3 text-3xl text-gold">{group.title}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {group.designs.map((design) => {
            const copies = copiesByDesign.get(design.designId) ?? [];
            return (
              <article key={design.designId} className="flex flex-col gap-2">
                <CollectibleRenderer pull={preview(design)} compact={copies.length === 0} />
                <div className="flex items-center justify-between text-xs"><span className={copies.length ? "text-gold" : "text-steel"}>{copies.length ? `${copies.length} owned variant${copies.length === 1 ? "" : "s"}` : "Catalog preview · not collected"}</span><span className="text-steel">{design.kind === "accolade" ? "Accolade" : design.kind === "best_of" ? "Best Of" : "Season Card"}</span></div>
                {copies.length ? <div className="flex flex-wrap gap-2">{copies.map((copy) => <div key={copy.inventoryId} className="flex min-w-[150px] flex-col gap-1 rounded border border-line p-2"><CollectibleRenderer pull={{ design: copy.payload, foil: copy.foil, foilType: copy.foilType as never, signed: copy.signed, autograph: copy.autograph, guaranteedFoil: copy.slotPosition === 5, inventoryId: copy.inventoryId }} compact /><Link href={`${base}/season-end/copy/${copy.inventoryId}`} className="text-[11px] text-coral underline-offset-4 hover:underline">View copy #{copy.inventoryId}</Link></div>)}</div> : null}
              </article>
            );
          })}
        </div>
      </section>)}
    </main>
  );
}

export default async function SeasonEndCollectionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return SeasonEndCollectionView({ league: "premier", releaseId: typeof params.release === "string" ? params.release : undefined });
}
