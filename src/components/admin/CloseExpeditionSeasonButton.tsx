"use client";

import { useState, useTransition } from "react";
import { closeExpeditionSeasonAction } from "@/lib/expeditions/admin-actions";
import { accoladeLine } from "@/lib/expeditions/standings";

/** Awards the season's three marks. Two taps: the first arms it, the
 *  second closes — a season closes once, and the marks are for good. */
export default function CloseExpeditionSeasonButton({ season, closed }: { season: string; closed: boolean }) {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await closeExpeditionSeasonAction(season);
      setArmed(false);
      setStatus(result.ok ? (result.accolades.length > 0 ? result.accolades.map(accoladeLine).join(" · ") : "Nothing to award: nobody has claimed a run this season.") : result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={close}
        disabled={pending || closed}
        data-testid={`close-season-${season}`}
        className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
          armed ? "border-coral bg-coral/15 text-coral" : "border-border-strong bg-surface text-muted hover:text-white"
        }`}
      >
        {closed ? `Season ${season} is closed` : pending ? "Closing…" : armed ? `Tap again to close ${season} and award the marks` : `Close season ${season}`}
      </button>
      {armed && !pending ? (
        <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted underline-offset-4 hover:underline">
          cancel
        </button>
      ) : null}
      {status ? <span className="text-xs text-muted">{status}</span> : null}
    </div>
  );
}
