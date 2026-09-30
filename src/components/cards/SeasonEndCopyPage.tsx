import Link from "next/link";
import { notFound } from "next/navigation";
import CollectibleRenderer from "@/components/cards/CollectibleRenderer";
import { copyPull } from "@/components/cards/seasonEndCopy";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchSeasonEndPublicCopy } from "@/lib/season-end/release-queries";
import styles from "./CardsPageShell.module.css";

export async function SeasonEndCopyView({ id, league }: { id: string; league: "premier" | "academy" }) {
  const inventoryId = Number(id);
  if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) notFound();
  const copy = await fetchSeasonEndPublicCopy(createBettingServiceClient(), inventoryId);
  if (!copy || copy.payload.league !== league) notFound();
  const base = league === "academy" ? "/academy/cards" : "/cards";
  return (
    <main className={styles.page + " " + styles.standalone} data-league={league}>
      <p className="label-dash text-gold">Season&apos;s End · public copy</p>
      <h1 className={styles.title}>{copy.payload.display.title}</h1>
      <p className="text-sm text-steel">Release {copy.payload.season} · copy #{copy.inventoryId} · slot {copy.slotPosition} · {copy.lifecycleStatus === "active" ? "currently held" : `historical · ${copy.lifecycleStatus}`}</p>
      <div className="max-w-sm"><CollectibleRenderer pull={copyPull(copy)} /></div>
      <p className="text-sm text-steel">This page reads the frozen artwork, autograph and finish saved on the owned copy. It never re-queries live award results.</p>
      <Link href={`${base}/season-end?release=${encodeURIComponent(copy.releaseId)}`} className="w-fit text-sm text-coral underline-offset-4 hover:underline">← Back to this release</Link>
    </main>
  );
}
