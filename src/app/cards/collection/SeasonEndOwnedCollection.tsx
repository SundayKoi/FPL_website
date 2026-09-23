import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import SeasonEndDustButton from "@/components/cards/SeasonEndDustButton";
import type { CardLeague } from "@/lib/cards/queries";
import { fetchPublishedSeasonEndReleases, fetchSeasonEndOwnedCopies } from "@/lib/season-end/release-queries";

export default async function SeasonEndOwnedCollection({ service, discordId, league, base }: {
  service: SupabaseClient;
  discordId: string;
  league: CardLeague;
  base: string;
}) {
  const releases = await fetchPublishedSeasonEndReleases(service, league);
  const collections = await Promise.all(releases.map(async (release) => ({
    release,
    copies: await fetchSeasonEndOwnedCopies(service, release.id, discordId),
  })));
  const owned = collections.filter(({ copies }) => copies.length > 0);

  return (
    <section id="season-end-collection" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Your Season&apos;s End cards</h2>
        <Link href={`${base}/season-end`} className="text-xs text-steel underline-offset-4 hover:text-coral hover:underline">Browse the full checklist →</Link>
      </div>
      {owned.length === 0 ? (
        <p className="text-sm text-steel">No Season&apos;s End cards collected in this league yet. <Link href={`${base}/packs`} className="text-coral underline">Explore packs</Link></p>
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
