"use client";

// The manual pull of the Weekly Draw's handle. The cron
// (.github/workflows/weekly-draw.yml) is the everyday path — this is here
// for the Tuesday it doesn't fire. The RPC behind it is idempotent, so the
// worst a second press can do is tell you who already won.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runWeeklyDrawAction } from "@/lib/packs/admin-actions";

export default function AdminWeeklyDraw() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await runWeeklyDrawAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-end gap-3 p-4">
      <div className="flex flex-col gap-1">
        <span className="label-dash">The Weekly Draw</span>
        <span className="text-xs font-semibold text-muted">
          {done
            ? "Ran — see /cards for the week's winner"
            : "Runs itself Tuesdays; press if the cron missed"}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="rounded-full border border-prestige/60 bg-prestige/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-prestige disabled:opacity-50"
      >
        Run the draw
      </button>
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
