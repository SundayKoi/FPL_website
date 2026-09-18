"use client";

import { useState, useTransition } from "react";
import { openSeasonEndPackAction, type SeasonEndOpenPackResult, type SeasonEndPullResult } from "@/lib/packs/season-end-actions";
import type { SeasonEndRelease } from "@/lib/season-end/release-queries";
import type { SeasonEndCatalog } from "@/lib/season-end/collectibles";
import CollectibleRenderer from "./CollectibleRenderer";

function requestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `season-end-${Date.now()}`;
}

function slotCopy(slot: number): string {
  if (slot < 2) return "Season Card";
  if (slot < 4) return "Accolade or Best Of";
  return "Guaranteed foil from any family";
}

export default function SeasonEndPackShop({
  league,
  season,
  release,
  catalog,
  ownedDesignIds = [],
  adminTest = false,
}: {
  league: "premier" | "academy";
  season: string;
  release: SeasonEndRelease;
  catalog: SeasonEndCatalog;
  ownedDesignIds?: string[];
  adminTest?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [pulls, setPulls] = useState<SeasonEndPullResult[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const result: SeasonEndOpenPackResult = await openSeasonEndPackAction({ league, season, releaseId: release.id, mode: adminTest ? "admin_test" : "public", requestId: requestId() });
      if (!result.ok) { setError(result.error); return; }
      setPulls(result.cards);
      setBalance(result.balance);
    });
  }

  const owned = new Set(ownedDesignIds);
  const baseDesigns = catalog.designs;
  return (
    <section className="card-brand flex flex-col gap-5 p-5" data-testid="season-end-pack-shop">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-dash text-gold">Season&apos;s End · {league === "academy" ? "Academy" : "Premier"} · {season}</p>
          <h2 className="type-display mt-2 text-3xl">Season&apos;s End Pack</h2>
          <p className="mt-2 max-w-2xl text-sm text-steel">Five frozen collectibles: two Season Cards, two independently selected Accolade/Best Of cards, then one guaranteed foil. The finish is guaranteed; signatures are only eligible on Season Cards and Best Of.</p>
        </div>
        <button type="button" disabled={pending || release.paused} onClick={open} className="rounded-lg border border-gold bg-gold px-5 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50">
          {pending ? "Opening…" : adminTest ? "Open test pack" : `Open for ${release.price.toLocaleString("en-US")} betting dollars`}
        </button>
      </div>
      <div className="grid gap-2 text-sm text-steel sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((slot) => <div key={slot} className="rounded border border-line p-3"><span className="font-mono text-gold">{slot + 1}</span><p className="mt-1">{slotCopy(slot)}</p></div>)}
      </div>
      {release.signatureCalibration ? <p className="text-xs text-steel">Measured signature rate: {((Number(release.signatureCalibration.achievablePackProbability ?? 0)) * 100).toFixed(2)}% per pack; per-copy chance is capped at 5% when the signing book is sparse.</p> : <p className="text-xs text-coral">Signature calibration is not recorded; this release cannot be opened until staff completes the test rules.</p>}
      {release.paused ? <p className="text-sm text-coral">Purchases are paused. Existing charged openings retain their frozen terms.</p> : null}
      {error ? <p className="text-sm text-coral">{error}</p> : null}
      {balance !== null ? <p className="text-xs text-steel">Balance after opening: {balance.toLocaleString("en-US")}</p> : null}
      {pulls ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{pulls.map((pull) => <CollectibleRenderer key={pull.inventoryId} pull={pull} />)}</div> : null}
      <div>
        <p className="text-xs uppercase tracking-[.18em] text-steel">Base-design checklist · {baseDesigns.filter((design) => owned.has(design.designId)).length}/{baseDesigns.length}</p>
        <div className="mt-2 flex flex-wrap gap-2">{baseDesigns.map((design) => <span key={design.designId} className={`rounded-full border px-3 py-1 text-xs ${owned.has(design.designId) ? "border-gold text-gold" : "border-line text-steel"}`}>{owned.has(design.designId) ? "✓ " : ""}{design.display.title}</span>)}</div>
      </div>
    </section>
  );
}
