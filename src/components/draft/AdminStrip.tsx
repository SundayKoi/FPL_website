"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errCode, type Draft, type Lot, type Player, type Team } from "@/lib/draft/types";
import AdminAssignmentPanel from "./AdminAssignmentPanel";
import AdminForceNominate from "./AdminForceNominate";
import { friendly } from "./Toast";

export default function AdminStrip({
  draft,
  teams,
  players,
  lots,
  openLot,
  onError,
}: {
  draft: Draft;
  teams: Team[];
  players: Player[];
  lots: Lot[];
  openLot: Lot | null;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [countdown, setCountdown] = useState(String(draft.countdown_seconds));
  const [busy, setBusy] = useState(false);

  const run = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    if (!confirm(label)) return;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) onError(friendly(errCode(error)));
    } finally {
      setBusy(false);
    }
  };

  const isPaused = draft.status === "paused";
  const isLive = draft.status === "live";
  const isComplete = draft.status === "complete";
  const nominatorTeam = teams.find((t) => t.id === draft.current_nominator_team_id) ?? null;

  // The server undoes the sale with the highest sale_action_sequence; match it
  // exactly so the prompt cannot name the wrong players.
  const lastSold = lots
    .filter((l) => l.status === "sold")
    .sort((a, b) => (b.sale_action_sequence ?? 0) - (a.sale_action_sequence ?? 0))[0] ?? null;
  const cascaded = lastSold
    ? players.filter((p) => p.auto_assigned_from_lot_id === lastSold.id)
    : [];
  const undoLabel =
    cascaded.length > 0
      ? `Undo the last sale? ${cascaded.map((p) => p.display_name).join(", ")} ` +
        `${cascaded.length === 1 ? "was" : "were"} auto-assigned as a result and will also return to the pool.`
      : "Undo the last sale? The player returns to the pool and points are refunded.";

  return (
    <section className="card-brand flex flex-col gap-3 p-3">
      <h3 className="label-dash">Admin</h3>

      <div className="flex flex-wrap gap-2">
        {!isComplete &&
          (isPaused ? (
            <button
              disabled={busy}
              className="rounded border border-steel text-steel px-3 py-1.5 text-xs font-semibold hover:bg-steel/10 disabled:opacity-40"
              onClick={() =>
                run("Resume the draft?", () => supabase.rpc("resume_draft", { p_draft_id: draft.id }))
              }
            >
              Resume
            </button>
          ) : (
            <button
              disabled={busy || !isLive}
              className="rounded border border-steel text-steel px-3 py-1.5 text-xs font-semibold hover:bg-steel/10 disabled:opacity-40"
              onClick={() =>
                run("Pause the draft?", () => supabase.rpc("pause_draft", { p_draft_id: draft.id }))
              }
            >
              Pause
            </button>
          ))}

        <button
          disabled={busy}
          className="rounded border border-gold text-gold px-3 py-1.5 text-xs font-semibold hover:bg-gold/10 disabled:opacity-40"
          onClick={() =>
            run(undoLabel, () => supabase.rpc("undo_last_sale", { p_draft_id: draft.id }))
          }
        >
          Undo last sale
        </button>

        {openLot && (
          <>
            <button
              disabled={busy}
              className="rounded border border-red-500/60 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-40"
              onClick={() =>
                run("Cancel this lot? The nominator keeps their turn.", () =>
                  supabase.rpc("cancel_lot", { p_lot_id: openLot.id })
                )
              }
            >
              Cancel lot
            </button>
            <button
              disabled={busy}
              className="rounded border border-red-500/60 px-3 py-1.5 text-xs font-semibold text-red-400 disabled:opacity-40"
              onClick={() =>
                run("Force close this lot now, selling to the current leader?", () =>
                  supabase.rpc("force_close_lot", { p_lot_id: openLot.id })
                )
              }
            >
              Force close
            </button>
          </>
        )}
      </div>

      {!isComplete && (
        <div className="flex items-center gap-2">
          <label htmlFor="countdown-seconds" className="text-xs text-steel">
            Countdown (s)
          </label>
          <input
            id="countdown-seconds"
            type="number"
            min={5}
            max={300}
            value={countdown}
            onChange={(e) => setCountdown(e.target.value)}
            className="w-20 rounded border border-line bg-navy px-2 py-1 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
          />
          <button
            disabled={busy}
            className="rounded border border-steel text-steel px-3 py-1.5 text-xs font-semibold hover:bg-steel/10 disabled:opacity-40"
            onClick={() =>
              run(`Set countdown to ${countdown}s?`, () =>
                supabase.rpc("update_draft_settings", {
                  p_draft_id: draft.id,
                  p_countdown_seconds: Number(countdown),
                })
              )
            }
          >
            Save
          </button>
        </div>
      )}

      {isLive && !openLot && nominatorTeam && (
        <AdminForceNominate
          draft={draft}
          nominatorTeam={nominatorTeam}
          players={players}
          onError={onError}
        />
      )}

      {!isComplete && (
        <AdminAssignmentPanel
          draft={draft}
          teams={teams}
          players={players}
          openLot={openLot}
          onError={onError}
        />
      )}
    </section>
  );
}
