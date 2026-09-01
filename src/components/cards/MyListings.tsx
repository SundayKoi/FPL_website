"use client";

// Your side of the board: what you have up, and what became of what you had.
//
// Open listings sort first and are the only ones with a button, because they
// are the only ones there is still a decision to make about. The closed rows
// below them are the receipts — who bought it, for how much — and they stay
// because "did that sell?" is the question this panel exists to answer.
//
// Cancelling is a plain status flip through a server action; nothing moves, so
// there is no confirm on it. Taking your own card back off the market is not
// a decision anyone regrets.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import { editionLabel } from "@/lib/packs/week";
import { cancelListing } from "@/lib/market/actions";
import type { ListingStatus } from "@/lib/market/queries";
import { expiryLabel, type BoardCopy } from "./MarketBoard";

export interface MyListing {
  id: number;
  ask: number;
  note: string | null;
  status: ListingStatus;
  expiresAt: string;
  buyerUsername: string | null;
  stale: boolean;
  copy: BoardCopy | null;
}

/** What became of it, in one word the row can wear as a chip. */
export function statusLabel(listing: MyListing): string {
  if (listing.status === "sold") return listing.buyerUsername ? `Sold to ${listing.buyerUsername}` : "Sold";
  if (listing.status === "cancelled") return "Cancelled";
  if (listing.status === "expired") return "Expired";
  return expiryLabel(listing.expiresAt);
}

/** Open first (they still need you), then everything else newest-first. */
export function byOpenness(a: MyListing, b: MyListing): number {
  const open = Number(b.status === "open") - Number(a.status === "open");
  if (open !== 0) return open;
  return b.id - a.id;
}

export default function MyListings({ listings }: { listings: MyListing[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, startCancelling] = useTransition();
  const rows = [...listings].sort(byOpenness);

  function cancel(id: number) {
    setError(null);
    setBusyId(id);
    startCancelling(async () => {
      const result = await cancelListing(id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <p className="card-brand p-5 text-sm text-steel" data-testid="my-listings">
        You have nothing on the market.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="my-listings">
      <ul className="flex flex-col gap-2">
        {rows.map((listing) => (
          <li
            key={listing.id}
            className={`flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel p-3 text-[11px] ${
              listing.status === "open" ? "" : "opacity-70"
            }`}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
              {listing.copy?.playerName ?? "Card no longer available"}
            </span>
            {listing.copy ? <span className="text-steel">{editionLabel(listing.copy.editionWeek)}</span> : null}
            <span className="font-mono text-sm font-bold text-gold">{fmtPoints(listing.ask)}</span>
            <span className="text-steel">{statusLabel(listing)}</span>
            {listing.status === "open" && listing.stale ? (
              <span className="font-semibold uppercase tracking-wide text-red-400">Card has moved on</span>
            ) : null}
            {listing.status === "open" ? (
              <button
                type="button"
                onClick={() => cancel(listing.id)}
                disabled={pending && busyId === listing.id}
                className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-steel transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending && busyId === listing.id ? "Cancelling…" : "Cancel"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
