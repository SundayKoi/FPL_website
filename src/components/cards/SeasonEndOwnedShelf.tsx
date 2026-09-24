"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import CollectibleRenderer from "./CollectibleRenderer";
import SeasonEndDustButton from "./SeasonEndDustButton";
import { MAX_DUST_BATCH } from "@/lib/packs/config";
import type { SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";
import { dustSeasonEndCopiesAction, quoteSeasonEndDustCopiesAction } from "@/lib/season-end/commerce-actions";

type OwnedRelease = {
  release: { id: string; season: string; catalogVersion: number };
  copies: SeasonEndOwnedCopy[];
};

function copyPull(copy: SeasonEndOwnedCopy) {
  return {
    design: copy.payload,
    foil: copy.foil,
    foilType: copy.foilType as never,
    signed: copy.signed,
    autograph: copy.autograph,
    guaranteedFoil: copy.slotPosition === 5,
    inventoryId: copy.inventoryId,
  };
}

function finishLabel(copy: SeasonEndOwnedCopy): string {
  const finish = copy.foil ? `${copy.foilType ?? "Foil"} foil` : "Matte";
  return `${finish}${copy.signed ? " · signed" : ""}`;
}

function money(value: number): string {
  return value.toLocaleString("en-US");
}

export default function SeasonEndOwnedShelf({ owned, base }: { owned: OwnedRelease[]; base: string }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copies = owned.flatMap((group) => group.copies);
  const selectedCount = copies.reduce((count, copy) => count + Number(selectedIds.has(copy.inventoryId)), 0);

  function leaveSelectMode() {
    setSelecting(false);
    setSelectedIds(new Set());
    setMessage(null);
    setError(null);
  }

  function toggleSelected(inventoryId: number) {
    setMessage(null);
    setError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.delete(inventoryId)) return next;
      if (next.size >= MAX_DUST_BATCH) return current;
      next.add(inventoryId);
      return next;
    });
  }

  function dustSelected() {
    const ids = copies.filter((copy) => selectedIds.has(copy.inventoryId)).map((copy) => copy.inventoryId);
    if (ids.length === 0 || pending) return;
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const quote = await quoteSeasonEndDustCopiesAction(ids);
      if (!quote.ok) {
        setError(quote.error);
        return;
      }
      const expectedValue = quote.value;
      if (!window.confirm(`Dust ${ids.length} selected ${ids.length === 1 ? "copy" : "copies"} for +${money(expectedValue)} betting dollars? This cannot be undone.`)) return;

      const result = await dustSeasonEndCopiesAction(ids, expectedValue);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSelectedIds(new Set());
      setSelecting(result.skipped > 0);
      setMessage(`Dusted ${result.dusted} ${result.dusted === 1 ? "copy" : "copies"} for +${money(result.value)} betting dollars.${result.skipped > 0 ? ` ${result.skipped} could not be dusted because it changed or is no longer available.` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Select Season's End copies to dust" className="card-brand flex flex-col flex-wrap gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-white">Dust copies for betting dollars</p>
          <p className="text-xs leading-5 text-steel">
            {selecting
              ? `Choose up to ${MAX_DUST_BATCH} copies. You’ll see the total value before confirming.`
              : "Dust one copy at a time, or select several copies below to review one combined value."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selecting && selectedCount > 0 ? (
            <button type="button" disabled={pending} onClick={dustSelected} className="rounded-full bg-gold px-4 py-2 text-xs font-bold text-navy transition hover:bg-gold/90 disabled:opacity-50">
              {pending ? "Preparing…" : `Dust ${selectedCount} selected`}
            </button>
          ) : null}
          {selecting ? (
            <button type="button" disabled={pending} onClick={leaveSelectMode} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-steel hover:border-coral hover:text-white disabled:opacity-50">Cancel selection</button>
          ) : (
            <button type="button" onClick={() => setSelecting(true)} className="rounded-full border border-gold/70 px-4 py-2 text-xs font-semibold text-gold transition hover:bg-gold/10">Select to dust</button>
          )}
        </div>
        {message ? <p role="status" className="basis-full text-xs text-mint">{message}</p> : null}
        {error ? <p role="alert" className="basis-full text-xs text-coral">{error}</p> : null}
      </section>

      {owned.map(({ release, copies: releaseCopies }) => (
        <section key={release.id} className="flex flex-col gap-3" aria-label={`${release.season} Season's End release revision ${release.catalogVersion}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
            <h3 className="type-display text-xl text-gold">{release.season} · Season&apos;s End</h3>
            <span className="text-xs text-steel">Revision {release.catalogVersion} · {releaseCopies.length} {releaseCopies.length === 1 ? "copy" : "copies"}</span>
          </div>
          <div className="flex w-full flex-wrap justify-evenly gap-x-5 gap-y-5">
            {releaseCopies.map((copy) => {
              const selected = selectedIds.has(copy.inventoryId);
              const atCap = !selected && selectedCount >= MAX_DUST_BATCH;
              return (
                <article key={copy.inventoryId} className={`card-cell flex w-80 max-w-full flex-none flex-col items-center gap-2 rounded-xl ${selected ? "bg-gold/5 ring-2 ring-gold/70" : ""}`}>
                  {selecting ? (
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={pending || atCap}
                      onClick={() => toggleSelected(copy.inventoryId)}
                      title={atCap ? `The selection limit is ${MAX_DUST_BATCH} copies.` : undefined}
                      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-1 transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-gold bg-gold/10" : "border-transparent hover:border-gold/40"}`}
                    >
                      <CollectibleRenderer pull={copyPull(copy)} />
                      <span className={`w-full rounded-full px-3 py-1.5 text-xs font-semibold ${selected ? "bg-gold text-navy" : "bg-panel text-steel"}`}>
                        {selected ? "✓ Selected · click to remove" : atCap ? "Selection full" : "Select this copy"}
                      </span>
                    </button>
                  ) : (
                    <>
                      <CollectibleRenderer pull={copyPull(copy)} />
                      <div className="flex w-full flex-col items-center gap-2 px-1 text-center">
                        <p className="text-xs text-steel">Copy <span className="font-semibold text-white">#{copy.inventoryId}</span> · {finishLabel(copy)}</p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Link href={`${base}/season-end/copy/${copy.inventoryId}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-coral transition hover:border-coral/70 hover:bg-coral/10">
                            View copy
                          </Link>
                          <SeasonEndDustButton inventoryId={copy.inventoryId} />
                        </div>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
