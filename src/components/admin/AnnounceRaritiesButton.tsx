"use client";

import { useState, useTransition } from "react";
import { announceRaritiesAction } from "@/lib/cards/announce-actions";

/** Posts the rarities announcement to the cards channel. Two taps, like
 *  the Gauntlet's: the first arms it, the second sends. */
export default function AnnounceRaritiesButton() {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await announceRaritiesAction();
      setArmed(false);
      setStatus(result.ok ? "Posted to the cards channel." : result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={send}
        disabled={pending}
        className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
          armed ? "border-coral bg-coral/15 text-coral" : "border-border-strong bg-surface text-muted hover:text-white"
        }`}
      >
        {pending ? "Posting…" : armed ? "Tap again to post the announcement" : "Announce the new rarities in #cards"}
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
