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
    <section className="flex flex-col gap-3 rounded-lg border border-rose-700 bg-rose-950/20 p-3">
      <h3 className="text-sm font-bold text-rose-300">Admin</h3>

      <div className="flex flex-wrap gap-2">
        {isPaused ? (
          <button
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            onClick={() =>
              run("Resume the draft?", () => supabase.rpc("resume_draft", { p_draft_id: draft.id }))
            }
          >
            Resume
          </button>
        ) : (
          <button
            disabled={busy || !isLive}
            className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
            onClick={() =>
              run("Pause the draft?", () => supabase.rpc("pause_draft", { p_draft_id: draft.id }))
            }
          >
            Pause
          </button>
        )}

        <button
          disabled={busy}
          className="rounded bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
              className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
              className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
        <label htmlFor="countdown-seconds" className="text-xs text-zinc-400">
          Countdown (s)
        </label>
        <input
          id="countdown-seconds"
          type="number"
          min={5}
          max={300}
          value={countdown}
          onChange={(e) => setCountdown(e.target.value)}
          className="w-20 rounded border border-zinc-700 bg-black/30 px-2 py-1 text-sm text-zinc-100"
        />
        <button
          disabled={busy}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
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
