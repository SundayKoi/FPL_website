"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errDetail, type Draft, type Player, type Team } from "@/lib/draft/types";
import { openRoles, roundMinimum } from "@/lib/draft/derive";

/** Opens a lot on behalf of the team on the clock, for when a captain is
 *  absent. Unlike direct assignment this keeps the auction: the lot opens at
 *  the round minimum with that team leading, and everyone bids as normal. */
export default function AdminForceNominate({
  draft,
  nominatorTeam,
  players,
  onError,
}: {
  draft: Draft;
  nominatorTeam: Team;
  players: Player[];
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [playerId, setPlayerId] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);

  const minimum = roundMinimum(draft);

  // Only players this team could legally take — the RPC enforces the same rule,
  // this just keeps the list honest.
  const open = openRoles(nominatorTeam.id, players);
  const available = players.filter(
    (p) => p.draft_id === draft.id && p.team_id === null && open.includes(p.role)
  );

  const nominate = async () => {
    if (!playerId || busy) return;
    const player = available.find((p) => p.id === playerId);
    if (!player) return;
    // Blank means the round minimum, matching the RPC's default.
    if (opening !== "" && !/^\d+$/.test(opening)) {
      onError("Enter a whole number of points, or leave it blank for the minimum");
      return;
    }
    const amount = opening === "" ? null : Number(opening);
    if (
      !confirm(
        `Nominate ${player.display_name} for ${nominatorTeam.name} at ${amount ?? minimum} points? ` +
          `The auction opens as if they had nominated.`
      )
    ) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_nominate", {
      p_draft_id: draft.id,
      p_player_id: playerId,
      p_opening_bid: amount,
    });
    setBusy(false);
    if (error) {
      onError(errDetail(error));
      return;
    }
    setPlayerId("");
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="label-dash">Force nominate</h3>
      <p className="text-xs text-steel">
        Opens the auction for {nominatorTeam.name}, who are on the clock. Everyone still bids.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-steel">
          Player
          <select
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
            disabled={busy || available.length === 0}
            className="input-brand px-2 py-1 text-sm disabled:opacity-40"
          >
            <option value="">— select player —</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} · {p.role}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-steel">
          Opens at
          <input
            type="text"
            inputMode="numeric"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            placeholder={String(minimum)}
            aria-label="Opening bid"
            disabled={busy}
            className="w-16 input-brand px-2 py-1 text-sm disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          onClick={() => void nominate()}
          disabled={busy || !playerId}
          className="btn-coral px-3 py-1.5 text-xs"
        >
          Nominate for {nominatorTeam.name}
        </button>
      </div>
    </div>
  );
}
