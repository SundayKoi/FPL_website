"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CardLeague } from "@/lib/cards/queries";
import { runSeasonEndAutoDustAction, saveSeasonEndAutoDustAction } from "@/lib/season-end/autoDust-actions";

export default function SeasonEndAutoDustPanel({ league, initialEnabled, duplicateCount }: {
  league: CardLeague;
  initialEnabled: boolean;
  duplicateCount: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save(next: boolean) {
    setError(null);
    setMessage(null);
    setArmed(false);
    startTransition(async () => {
      const result = await saveSeasonEndAutoDustAction(league, next);
      if (!result.ok) { setError(result.error); return; }
      setEnabled(result.enabled);
      setMessage(result.enabled ? "On. Exact duplicates from future public packs will dust automatically." : "Off. Future pulls will stay in your collection.");
    });
  }

  function run() {
    if (!armed) { setArmed(true); return; }
    setError(null);
    startTransition(async () => {
      const result = await runSeasonEndAutoDustAction(league);
      setArmed(false);
      if (!result.ok) { setError(result.error); return; }
      setMessage(result.result.dusted
        ? `Dusted ${result.result.dusted} for +${result.result.value.toLocaleString("en-US")} betting dollars${result.result.remaining ? ` · ${result.result.remaining} more remain` : ""}.`
        : "No exact duplicates remain.");
      router.refresh();
    });
  }

  return (
    <section aria-label="Season's End auto-dust" className="card-brand flex flex-col gap-3 p-4 text-sm">
      <div>
        <p className="label-dash text-gold">Auto-dust duplicates</p>
        <p className="mt-1 text-xs text-steel">Keep the oldest active copy of each exact design, foil finish, and signature in each release. Other variants stay. Applies to this league only.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-white">
          <input type="checkbox" checked={enabled} disabled={pending} onChange={(event) => save(event.target.checked)} />
          Auto-dust future duplicates
        </label>
        <span className="text-xs text-steel">{duplicateCount} {duplicateCount === 1 ? "duplicate" : "duplicates"} on your shelf now</span>
        <button type="button" disabled={pending || !enabled || duplicateCount === 0} onClick={run} className="rounded-full border border-gold px-3 py-1.5 text-xs text-gold disabled:opacity-40">
          {armed ? `Really dust ${Math.min(duplicateCount, 200)}?` : `Dust ${Math.min(duplicateCount, 200)} now`}
        </button>
      </div>
      {message ? <p role="status" className="text-xs text-mint">{message}</p> : null}
      {error ? <p role="alert" className="text-xs text-coral">{error}</p> : null}
    </section>
  );
}
