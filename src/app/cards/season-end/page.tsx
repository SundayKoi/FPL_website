import Link from "next/link";
import CardsPageHeader, { cardsEyebrow } from "@/components/cards/CardsPageHeader";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { getBettingUser } from "@/lib/betting/wallet";
import { fetchCardSeason, type CardLeague } from "@/lib/cards/queries";
import { fetchSeasonEndCatalog, fetchSeasonEndOwnedDesignIds, fetchSeasonEndRelease } from "@/lib/season-end/release-queries";

export async function SeasonEndCollectionView({ league }: { league: CardLeague }) {
  const service = createBettingServiceClient();
  const season = await fetchCardSeason(service, league);
  const user = await getBettingUser();
  const release = season ? await fetchSeasonEndRelease(service, league, season, { publicOnly: true }) : null;
  const catalog = release ? await fetchSeasonEndCatalog(service, release) : null;
  if (!season || !release || !catalog) {
    return <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-10 text-white"><p className="label-dash text-gold">Season&apos;s End</p><h1 className="type-display text-4xl">The collection is not published yet</h1><p className="text-steel">Staff testing must finish before this release appears in the public collection.</p></main>;
  }
  const owned = new Set(user ? await fetchSeasonEndOwnedDesignIds(service, release.id, user.discordId) : []);
  const previewPulls = catalog.designs.map((design) => ({ design, foil: false, foilType: null, signed: false, autograph: null, guaranteedFoil: false, inventoryId: 0 }));
  return (
    <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-8 px-4 py-10 text-white sm:px-6">
      <CardsPageHeader eyebrow={cardsEyebrow("Season's End", league, season)} title="Season&apos;s End collection">
        Collectible designs are grouped separately from player-card gameplay. Variants sit beneath one base design, so duplicates do not inflate the checklist.
      </CardsPageHeader>
      <p className="text-sm text-steel">Owned base designs: <span className="text-gold">{catalog.designs.filter((design) => owned.has(design.designId)).length}/{catalog.designs.length}</span> · rules {release.rulesVersion}</p>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{previewPulls.map((pull) => <div key={pull.design.designId} className="flex flex-col gap-2"><CollectibleRenderer pull={pull} compact={!owned.has(pull.design.designId)} /><p className={`text-xs ${owned.has(pull.design.designId) ? "text-gold" : "text-steel"}`}>{owned.has(pull.design.designId) ? "Owned" : "Not collected"}</p></div>)}</div>
      <Link href={league === "academy" ? "/academy/cards/packs" : "/cards/packs"} className="w-fit text-sm text-coral underline-offset-4 hover:underline">← Back to packs</Link>
    </main>
  );
}

export default async function SeasonEndCollectionPage() {
  return SeasonEndCollectionView({ league: "premier" });
}
