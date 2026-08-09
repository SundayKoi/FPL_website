"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { errCode, type Draft, type Lot } from "@/lib/draft/types";
import { friendly } from "./Toast";

export default function AdminStrip({
  draft,
  openLot,
  onError,
}: {
  draft: Draft;
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

  return (
    <section className="card-brand flex flex-col gap-3 p-3">
      <h3 className="label-dash">Admin</h3>

      <div className="flex flex-wrap gap-2">
        {isPaused ? (
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
        )}

        <button
          disabled={busy}
          className="rounded border border-gold text-gold px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          onClick={() =>
            run("Undo the last sale? The player returns to the pool and points are refunded.", () =>
              supabase.rpc("undo_last_sale", { p_draft_id: draft.id })
            )
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
    </section>
  );
}
