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
  const [amount, setAmount] = useState<number>(quick);
  const place = async (a: number) => {
    if (!Number.isFinite(a)) return onError("Enter a valid bid amount");
    const blocked = bidBlockReason(team, lot, lotPlayer, players, a);
    if (blocked) return onError(blocked);
    const { error } = await supabase.rpc("place_bid", { p_lot_id: lot.id, p_amount: a });
    if (error) onError(friendly(errCode(error)));
  };
  const quickBlocked = bidBlockReason(team, lot, lotPlayer, players, quick);
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <button className="rounded bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-40"
        disabled={!!quickBlocked} onClick={() => place(quick)}>
        Bid {quick}
      </button>
      <input type="number" className="w-24 rounded border p-2" value={amount}
        min={quick} max={maxBid(team, players)}
        onChange={(e) => setAmount(Number(e.target.value))} />
      <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-40"
        disabled={!!bidBlockReason(team, lot, lotPlayer, players, amount)}
        onClick={() => place(amount)}>
        Bid
      </button>
      {quickBlocked && <span className="text-sm opacity-70">{quickBlocked}</span>}
    </div>
  );
}
