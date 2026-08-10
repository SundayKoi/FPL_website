"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bidBlockReason, maxBid } from "@/lib/draft/derive";
import { errCode, type Lot, type Player, type Team } from "@/lib/draft/types";
import { friendly } from "./Toast";

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
  const [prevKey, setPrevKey] = useState(`${lot.id}:${lot.current_bid}`);
  const key = `${lot.id}:${lot.current_bid}`;
  if (key !== prevKey) {
    const isNewLot = !prevKey.startsWith(lot.id);
    setPrevKey(key);
    if (isNewLot || !(amount >= quick)) setAmountStr(String(quick));
  }
  const place = async (a: number) => {
    if (!Number.isFinite(a)) return onError("Enter a valid bid amount");
    const blocked = bidBlockReason(team, lot, lotPlayer, players, a);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("place_bid", { p_lot_id: lot.id, p_amount: a });
    if (error) onError(friendly(errCode(error)));
  };
  const quickBlocked = bidBlockReason(team, lot, lotPlayer, players, quick);
  const cap = maxBid(team, players);
  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-3">
      <button className="rounded bg-gold px-4 py-2 font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        type="button" disabled={!!quickBlocked} onClick={() => place(quick)}>
        Bid {quick}
      </button>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        void place(amount);
      }}>
        <div className="flex flex-col gap-1">
          <label className="label-dash">YOUR BID</label>
          <input type="number" className="w-28 rounded border border-line bg-navy p-3 text-lg font-display not-italic text-white placeholder:text-steel/60 focus:border-gold focus:outline-none" value={amountStr}
            min={quick} max={cap} placeholder={String(quick)}
            onChange={(e) => setAmountStr(e.target.value)} />
          <span className="text-xs text-steel">min {quick} · max {cap}</span>
        </div>
        <button className="rounded border border-gold px-3 py-2 text-gold hover:bg-gold/10 disabled:opacity-40"
          disabled={!Number.isFinite(amount) || !!bidBlockReason(team, lot, lotPlayer, players, amount)}>
          Bid
        </button>
      </form>
      {quickBlocked && <span className="text-sm text-steel">{quickBlocked}</span>}
    </div>
  );
}
