import Link from "next/link";
import { notFound } from "next/navigation";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchSeasonEndPublicCopy } from "@/lib/season-end/release-queries";

export async function SeasonEndCopyView({ id, league }: { id: string; league: "premier" | "academy" }) {
  const inventoryId = Number(id);
  if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) notFound();
  const copy = await fetchSeasonEndPublicCopy(createBettingServiceClient(), inventoryId);
  if (!copy || copy.payload.league !== league) notFound();
  const base = league === "academy" ? "/academy/cards" : "/cards";
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-10 text-white">
      <p className="label-dash text-gold">Season&apos;s End · public copy</p>
      <h1 className="type-display text-4xl">{copy.payload.display.title}</h1>
      <p className="text-sm text-steel">Release {copy.payload.season} · copy #{copy.inventoryId} · slot {copy.slotPosition} · {copy.lifecycleStatus === "active" ? "currently held" : `historical · ${copy.lifecycleStatus}`}</p>
      <div className="max-w-sm"><CollectibleRenderer pull={{ design: copy.payload, foil: copy.foil, foilType: copy.foilType as never, signed: copy.signed, autograph: copy.autograph, guaranteedFoil: copy.slotPosition === 5, inventoryId: copy.inventoryId }} /></div>
      <p className="text-sm text-steel">This page reads the frozen artwork, autograph and finish saved on the owned copy. It never re-queries live award results.</p>
      <Link href={`${base}/season-end?release=${encodeURIComponent(copy.releaseId)}`} className="w-fit text-sm text-coral underline-offset-4 hover:underline">← Back to this release</Link>
    </main>
  );
}
