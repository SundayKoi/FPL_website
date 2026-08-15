"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errMessage, type Draft, type Player, type Team } from "@/lib/draft/types";
import { openRoles } from "@/lib/draft/derive";

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

  const minimum =
    draft.round_minimums[Math.min(draft.current_round, draft.round_minimums.length) - 1] ?? 0;

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
      onError(errMessage(error).replace(/^[A-Z_]+:\s*/, ""));
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
            className="rounded border border-line bg-navy px-2 py-1 text-sm text-white focus:border-gold focus:outline-none disabled:opacity-40"
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
            className="w-16 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none disabled:opacity-40"
          />
        </label>
        <button
          type="button"
          onClick={() => void nominate()}
          disabled={busy || !playerId}
          className="rounded bg-gold px-3 py-1.5 text-xs font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          Nominate for {nominatorTeam.name}
        </button>
      </div>
    </div>
  );
}
