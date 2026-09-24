import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import SeasonEndAutoDustPanel from "@/components/cards/SeasonEndAutoDustPanel";
import type { CardLeague } from "@/lib/cards/queries";
import { seasonEndDuplicateIds } from "@/lib/season-end/autoDust";
import { fetchSeasonEndAutoDustEnabled } from "@/lib/season-end/autoDustServer";
import { fetchPublishedSeasonEndReleases, fetchSeasonEndOwnedCopies, type SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";
import type { SeasonEndKind } from "@/lib/season-end/collectibles";
import { SEASON_END_COLLECTION_SORTS, type SeasonEndCollectionSort } from "@/lib/season-end/collectionSort";
import SeasonEndCollectionSortControl from "@/components/cards/SeasonEndCollectionSort";
import SeasonEndOwnedShelf from "@/components/cards/SeasonEndOwnedShelf";

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
    <section id="season-end-collection" className="flex flex-col gap-5">
      <div className="card-brand flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="label-dash text-gold">Your shelf · Season&apos;s End</p>
            <h2 className="type-display text-2xl sm:text-3xl">Your Season&apos;s End cards</h2>
            <p className="text-sm leading-6 text-steel">Each entry is a copy you own. Open a copy to inspect it, or select copies to review their dust value together.</p>
          </div>
          <Link href={`${base}/season-end`} className="text-sm text-coral underline-offset-4 hover:underline">Browse the full checklist →</Link>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-line bg-canvas/50 px-3 py-1.5 text-steel">{totalCopies} {totalCopies === 1 ? "copy" : "copies"} owned</span>
          <span className="rounded-full border border-line bg-canvas/50 px-3 py-1.5 text-steel">{owned.reduce((count, collection) => count + collection.copies.length, 0)} in this view</span>
        </div>
      </div>

      {totalCopies > 0 ? (
        <div className="card-brand flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
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
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${kind === filter.kind ? "border-coral bg-coral text-navy" : "border-line text-steel hover:border-coral hover:text-white"}`}
                >
                  {filter.label} <span className={kind === filter.kind ? "opacity-80" : "text-steel/80"}>{familyCounts[filter.kind]}</span>
                </Link>
              );
            })}
          </nav>
          <SeasonEndCollectionSortControl value={sort} />
        </div>
      ) : null}

      {totalCopies === 0 ? (
        <div className="card-brand flex flex-col gap-2 p-5">
          <p className="font-semibold text-white">No Season&apos;s End cards yet</p>
          <p className="text-sm text-steel">Open a Season&apos;s End pack to start your shelf. <Link href={`${base}/packs`} className="text-coral underline-offset-4 hover:underline">Explore packs →</Link></p>
        </div>
      ) : owned.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel/50 p-4 text-sm text-steel">No {COLLECTION_FILTERS.find((filter) => filter.kind === kind)?.label ?? "matching"} collected yet. <Link href={`${base}/collection?view=season-end`} className="text-coral underline-offset-4 hover:underline">Show all cards</Link></p>
      ) : (
        <SeasonEndOwnedShelf key={`${kind}-${sort}`} owned={owned} base={base} />
      )}

      <SeasonEndAutoDustPanel league={league} initialEnabled={autoDustEnabled} duplicateCount={seasonEndDuplicateIds(collections.flatMap(({ copies }) => copies)).length} />
    </section>
  );
}
