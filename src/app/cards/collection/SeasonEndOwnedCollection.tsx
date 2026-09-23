import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import SeasonEndDustButton from "@/components/cards/SeasonEndDustButton";
import SeasonEndAutoDustPanel from "@/components/cards/SeasonEndAutoDustPanel";
import type { CardLeague } from "@/lib/cards/queries";
import { seasonEndDuplicateIds } from "@/lib/season-end/autoDust";
import { fetchSeasonEndAutoDustEnabled } from "@/lib/season-end/autoDustServer";
import { fetchPublishedSeasonEndReleases, fetchSeasonEndOwnedCopies, type SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";
import type { SeasonEndKind } from "@/lib/season-end/collectibles";
import { SEASON_END_COLLECTION_SORTS, type SeasonEndCollectionSort } from "@/lib/season-end/collectionSort";
import SeasonEndCollectionSortControl from "@/components/cards/SeasonEndCollectionSort";

const COLLECTION_FILTERS: Array<{ kind: SeasonEndKind | "all"; label: string }> = [
  { kind: "all", label: "All cards" },
  { kind: "season", label: "Season Cards" },
  { kind: "best_of", label: "Best Of" },
  { kind: "accolade", label: "Accolades" },
];

function ratingOf(copy: SeasonEndOwnedCopy): number {
  if (copy.payload.kind === "season") return copy.payload.card.overall;
  if (copy.payload.kind === "best_of") return copy.payload.evidence.winnerValue ?? copy.payload.champion.winRate;
  return copy.payload.evidence.winnerValue ?? 0;
}

function copyOrder(sort: SeasonEndCollectionSort) {
  return (a: SeasonEndOwnedCopy, b: SeasonEndOwnedCopy) => {
    const byName = () => a.payload.display.title.localeCompare(b.payload.display.title) || a.designId.localeCompare(b.designId) || a.inventoryId - b.inventoryId;
    if (sort === "name") return byName();
    if (sort === "newest") return b.inventoryId - a.inventoryId;
    if (sort === "rating") return ratingOf(b) - ratingOf(a) || byName();
    // Like the weekly shelf's showcase order: signature first, then rating,
    // followed by the finish and a stable title order.
    return Number(b.signed) - Number(a.signed)
      || ratingOf(b) - ratingOf(a)
      || Number(b.foil) - Number(a.foil)
      || b.payload.baseSalvage - a.payload.baseSalvage
      || byName();
  };
}

function compareNewestSeason(a: string, b: string): number {
  const aNumber = Number(a.match(/\d+/)?.[0] ?? Number.NEGATIVE_INFINITY);
  const bNumber = Number(b.match(/\d+/)?.[0] ?? Number.NEGATIVE_INFINITY);
  return bNumber - aNumber || b.localeCompare(a);
}

export default async function SeasonEndOwnedCollection({ service, discordId, league, base, kind: requestedKind, sort: requestedSort }: {
  service: SupabaseClient;
  discordId: string;
  league: CardLeague;
  base: string;
  kind?: string;
  sort?: string;
}) {
  const kind: SeasonEndKind | "all" = COLLECTION_FILTERS.some((filter) => filter.kind === requestedKind)
    ? requestedKind as SeasonEndKind | "all"
    : "all";
  const sort: SeasonEndCollectionSort = SEASON_END_COLLECTION_SORTS.some((option) => option.key === requestedSort)
    ? requestedSort as SeasonEndCollectionSort
    : "best";
  const [releases, autoDustEnabled] = await Promise.all([
    fetchPublishedSeasonEndReleases(service, league),
    fetchSeasonEndAutoDustEnabled(service, discordId, league),
  ]);
  const collections = await Promise.all(releases.map(async (release) => ({
    release,
    copies: await fetchSeasonEndOwnedCopies(service, release.id, discordId),
  })));
  const totalCopies = collections.reduce((total, { copies }) => total + copies.length, 0);
  const familyCounts = Object.fromEntries(COLLECTION_FILTERS.map(({ kind: filterKind }) => [
    filterKind,
    filterKind === "all"
      ? totalCopies
      : collections.reduce((total, { copies }) => total + copies.filter((copy) => copy.payload.kind === filterKind).length, 0),
  ])) as Record<SeasonEndKind | "all", number>;
  const owned = collections
    .map(({ release, copies }) => ({
      release,
      copies: (kind === "all" ? copies : copies.filter((copy) => copy.payload.kind === kind)).slice().sort(copyOrder(sort)),
    }))
    .filter(({ copies }) => copies.length > 0);
  if (sort === "week") owned.sort((a, b) => compareNewestSeason(a.release.season, b.release.season));

  return (
    <section id="season-end-collection" className="flex flex-col gap-6">
      <SeasonEndAutoDustPanel league={league} initialEnabled={autoDustEnabled} duplicateCount={seasonEndDuplicateIds(collections.flatMap(({ copies }) => copies)).length} />
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Your Season&apos;s End cards</h2>
        <Link href={`${base}/season-end`} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">Browse the full checklist →</Link>
      </div>
      {totalCopies > 0 ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <nav aria-label="Filter Season's End cards by family" className="flex flex-wrap gap-2">
            {COLLECTION_FILTERS.map((filter) => {
              const params = new URLSearchParams({ view: "season-end" });
              if (filter.kind !== "all") params.set("kind", filter.kind);
              if (sort !== "best") params.set("sort", sort);
              return (
                <Link
                  key={filter.kind}
                  href={`${base}/collection?${params.toString()}`}
                  aria-current={kind === filter.kind ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${kind === filter.kind ? "border-coral bg-coral text-navy" : "border-line text-steel hover:border-coral hover:text-white"}`}
                >
                  {filter.label} · {familyCounts[filter.kind]}
                </Link>
              );
            })}
          </nav>
          <SeasonEndCollectionSortControl value={sort} />
        </div>
      ) : null}
      {totalCopies === 0 ? (
        <p className="text-sm text-steel">No Season&apos;s End cards collected in this league yet. <Link href={`${base}/packs`} className="text-coral underline">Explore packs</Link></p>
      ) : owned.length === 0 ? (
        <p className="text-sm text-steel">No {COLLECTION_FILTERS.find((filter) => filter.kind === kind)?.label ?? "matching"} collected yet. <Link href={`${base}/collection?view=season-end`} className="text-coral underline-offset-4 hover:underline">Show all cards</Link></p>
      ) : owned.map(({ release, copies }) => (
        <section key={release.id} className="flex flex-col gap-4" aria-label={`${release.season} Season's End release revision ${release.catalogVersion}`}>
          <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
            <h3 className="type-display text-xl text-gold">{release.season} · Season&apos;s End</h3>
            <span className="text-xs text-steel">Revision {release.catalogVersion} · {copies.length} {copies.length === 1 ? "copy" : "copies"}</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {copies.map((copy) => (
              <article key={copy.inventoryId} className="flex flex-col gap-2">
                <CollectibleRenderer pull={{ design: copy.payload, foil: copy.foil, foilType: copy.foilType as never, signed: copy.signed, autograph: copy.autograph, guaranteedFoil: copy.slotPosition === 5, inventoryId: copy.inventoryId }} compact />
                <div className="flex items-center gap-3">
                  <Link href={`${base}/season-end/copy/${copy.inventoryId}`} className="text-xs text-coral underline-offset-4 hover:underline">View copy #{copy.inventoryId}</Link>
                  <SeasonEndDustButton inventoryId={copy.inventoryId} />
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
