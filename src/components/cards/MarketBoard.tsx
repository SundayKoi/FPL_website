"use client";

// The board: every copy currently for sale, at a fixed price, from anyone.
//
// A listing is not a trade — there is no negotiation and nobody to wait for,
// so the whole row reduces to one question ("do you want this at this price?")
// and one button. That is the reason this feature exists alongside the trading
// post rather than inside it.
//
// Two things the row has to say before that button is honest:
//   the CARD, not a description of it — every row opens the real copy through
//   CardCopyPreview, because "foil" is a word and a holograph is the thing you
//   are actually paying for. The frozen json is fetched on open rather than
//   shipped with the page: a busy board is hundreds of listings and almost
//   none of them get looked at (TradeBuilder makes the same call for a
//   partner's shelf).
//   whether it can still be delivered — `stale` is computed server-side and
//   means the copy has left the seller since. Buy is disabled rather than
//   hidden, so the row explains itself instead of quietly losing its button.
//
// Buying arms first and commits second. Money leaves in one click otherwise,
// and this is the only screen on the site where a misclick spends someone
// else's asking price.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/system/Toast";
import { fmtPoints } from "@/lib/betting/format";
import { easternStamp, relativeTime } from "@/lib/time";
import { useAutoDisarm } from "@/lib/ui/useAutoDisarm";
import { editionLabel } from "@/lib/packs/week";
import { buyListing } from "@/lib/market/actions";
import { fetchInventoryCardAction } from "@/lib/trades/actions";
import CardCopyPreview, { tierLabel } from "./CardCopyPreview";

/** The copy a listing points at, flattened for the client boundary — the
 *  frozen card stays on the server until somebody opens it. */
export interface BoardCopy {
  id: number;
  playerName: string;
  overall: number;
  tier: string;
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  altArt: boolean;
  editionWeek: string;
}

export interface BoardListing {
  id: number;
  sellerDiscordId: string;
  sellerUsername: string;
  ask: number;
  note: string | null;
  expiresAt: string;
  /** When it went up — "listed 2h ago" is the difference between a fresh
   *  ask and one nobody has wanted for a week. */
  createdAt?: string;
  /** The copy has left the seller — this listing can no longer be bought. */
  stale: boolean;
  /** Null once the copy has been dusted out from under the listing. */
  copy: BoardCopy | null;
}

/**
 * "4 days left" / "last day" — how long this listing has, in words.
 *
 * Rounded UP, deliberately: a listing with eleven hours on it has "1 day
 * left", not "0 days left", because zero reads as expired and it is not.
 * Anything already past reads as expired, which is the same thing the buy RPC
 * would say.
 */
export function expiryLabel(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "expired";
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) return "last day";
  return `${days} days left`;
}

/** Cheapest first — a board is shopping, and shopping sorts on price. */
export function byPrice(a: BoardListing, b: BoardListing): number {
  return a.ask - b.ask || a.id - b.id;
}

function ListingRow({
  listing,
  mine,
  onBought,
}: {
  listing: BoardListing;
  mine: boolean;
  onBought: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBuying] = useTransition();
  const { notify } = useToast();
  useAutoDisarm(armed, () => setArmed(false));
  const copy = listing.copy;
  const blocked = mine || listing.stale || !copy;

  function buy() {
    setError(null);
    if (!armed) {
      setArmed(true);
      return;
    }
    startBuying(async () => {
      const result = await buyListing(listing.id);
      setArmed(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(`Bought ${copy?.playerName ?? "the card"} for ${fmtPoints(listing.ask)}. It's on your shelf.`);
      onBought();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3" data-testid="market-listing">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <CardCopyPreview
          card={null}
          loadCard={async () => {
            if (!copy) return null;
            const result = await fetchInventoryCardAction(copy.id);
            return result.ok ? result.card : null;
          }}
          foil={copy?.foil ?? false}
          foilType={copy?.foilType ?? null}
          caption={{
            playerName: copy?.playerName ?? "Card no longer available",
            editionWeek: copy?.editionWeek,
            tier: copy?.tier,
            foil: copy?.foil,
            signed: copy?.signed,
            altArt: copy?.altArt,
          }}
          label={copy ? `View ${copy.playerName}'s card` : undefined}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {copy?.playerName ?? "Card no longer available"}
            </span>
            {copy ? (
              <>
                <span className="font-mono font-bold text-mint">{copy.overall}</span>
                <span className="text-steel">{tierLabel(copy.tier)}</span>
                <span className="text-steel">{editionLabel(copy.editionWeek)}</span>
                {copy.signed ? (
                  <span className="font-black text-gold" title="Autographed copy">
                    ✍
                  </span>
                ) : null}
                {copy.foil ? (
                  <span className="font-black text-gold" title="Foil copy">
                    ✦
                  </span>
                ) : null}
                {copy.altArt ? (
                  <span className="font-black tracking-[0.12em] text-gold" title="Alternate art print">
                    ALT
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
        </CardCopyPreview>

        <span className="ml-auto font-mono text-sm font-bold text-gold">{fmtPoints(listing.ask)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-steel">
        <span>
          from <span className="font-semibold text-white">{listing.sellerUsername}</span>
        </span>
        <span aria-hidden>·</span>
        <span>{expiryLabel(listing.expiresAt)}</span>
        {listing.createdAt ? (
          <>
            <span aria-hidden>·</span>
            <span title={easternStamp(listing.createdAt)}>listed {relativeTime(listing.createdAt)}</span>
          </>
        ) : null}
        {listing.note ? <span className="italic">“{listing.note}”</span> : null}
        {listing.stale ? (
          <span className="font-semibold uppercase tracking-wide text-red-400">Card has moved on</span>
        ) : null}

        <button
          type="button"
          onClick={buy}
          disabled={blocked || busy}
          title={mine ? "Your own listing" : undefined}
          className="btn-coral ml-auto px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mine ? "Yours" : busy ? "Buying…" : armed ? `Confirm ${fmtPoints(listing.ask)}` : "Buy"}
        </button>
      </div>

      {error ? <p className="text-[11px] text-red-400">{error}</p> : null}
    </li>
  );
}

export default function MarketBoard({
  listings,
  viewerDiscordId,
}: {
  listings: BoardListing[];
  viewerDiscordId: string;
}) {
  const router = useRouter();
  const sorted = [...listings].sort(byPrice);

  if (sorted.length === 0) {
    return (
      <p className="card-brand flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-steel" data-testid="market-board">
        <span>Nothing is for sale right now. List a duplicate and be the first.</span>
        <a href="#sell" className="btn-coral px-4 py-2 text-sm">
          List a card ↓
        </a>
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="market-board">
      {sorted.map((listing) => (
        <ListingRow
          key={listing.id}
          listing={listing}
          mine={listing.sellerDiscordId === viewerDiscordId}
          onBought={() => router.refresh()}
        />
      ))}
    </ul>
  );
}
