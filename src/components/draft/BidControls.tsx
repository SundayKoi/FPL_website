"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bidBlockReason, maxBid } from "@/lib/draft/derive";
import { errCode, type Lot, type Player, type Team } from "@/lib/draft/types";
import { friendly } from "./Toast";

/** How long the quick-bid button stays disarmed after someone else raises.
 * Long enough that a click aimed at the old price lands on a disabled button
 * instead of silently bidding the new one; short enough not to feel laggy. */
const REPRICE_DISARM_MS = 500;

export default function BidControls({ team, lot, lotPlayer, players, onError }: {
  team: Team; lot: Lot; lotPlayer: Player; players: Player[];
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const quick = lot.current_bid + 1;
  // Held as a string so the field can be empty while typing (Number("") is 0,
  // which used to snap an annoying leading zero back into the box).
  const [amountStr, setAmountStr] = useState<string>(String(quick));
  const amount = amountStr.trim() === "" ? NaN : Number(amountStr);
  const [disarmed, setDisarmed] = useState(false);
  const [repriceCount, setRepriceCount] = useState(0);

  // Race guard: when the price moves under you, never rewrite the typed
  // amount (the server rejects stale bids with BID_TOO_LOW; rewriting the
  // box mid-click is how people bid more than they meant). Only a NEW lot
  // resets the field — and a reprice disarms the quick button briefly so a
  // click aimed at the old price can't land on the new one.
  const [prevKey, setPrevKey] = useState(`${lot.id}:${lot.current_bid}`);
  const key = `${lot.id}:${lot.current_bid}`;
  if (key !== prevKey) {
    const isNewLot = !prevKey.startsWith(lot.id);
    setPrevKey(key);
    if (isNewLot) {
      setAmountStr(String(quick));
      setDisarmed(false);
    } else {
      setDisarmed(true);
      setRepriceCount((n) => n + 1);
    }
  }

  // re-arm after the disarm window; consecutive reprices restart the timer
  useEffect(() => {
    if (repriceCount === 0) return;
    const timer = window.setTimeout(() => setDisarmed(false), REPRICE_DISARM_MS);
    return () => window.clearTimeout(timer);
  }, [repriceCount]);

  const place = async (a: number) => {
    if (!Number.isFinite(a)) return onError("Enter a valid bid amount");
    const blocked = bidBlockReason(team, lot, lotPlayer, players, a);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("place_bid", { p_lot_id: lot.id, p_amount: a });
    if (error) onError(friendly(errCode(error)));
  };
  const quickBlocked = bidBlockReason(team, lot, lotPlayer, players, quick);
  const cap = maxBid(team, players);
  const typedBlocked = Number.isFinite(amount)
    ? bidBlockReason(team, lot, lotPlayer, players, amount)
    : null;
  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-3">
      <button className="btn-primary px-4 py-2"
        type="button" disabled={!!quickBlocked || disarmed} onClick={() => place(quick)}>
        Bid {quick}
      </button>
      {disarmed && !quickBlocked && (
        <span aria-live="polite" className="text-xs font-semibold text-gold">Price moved…</span>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        void place(amount);
      }}>
        <div className="flex flex-col gap-1">
          <label className="label-dash">YOUR BID</label>
  <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-28 rounded border border-border-strong bg-canvas p-3 text-lg font-display not-italic text-white placeholder:text-muted/60 focus:border-action-text focus:outline-none" value={amountStr}
            placeholder={String(quick)}
            onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, ""))} />
          <span className="text-xs text-muted">min {quick} · max {cap}</span>
        </div>
        <button className="rounded border border-action-text px-3 py-2 text-action-text hover:bg-action-fill/10 disabled:opacity-40"
          disabled={!Number.isFinite(amount) || !!typedBlocked}>
          Bid
        </button>
        {typedBlocked && Number.isFinite(amount) && amount < quick && (
          <span className="text-xs text-muted">Outbid — raise your number</span>
        )}
      </form>
      {quickBlocked && <span className="text-sm text-muted">{quickBlocked}</span>}
    </div>
  );
}
