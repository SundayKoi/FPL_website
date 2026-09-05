"use client";

import { useState, useTransition } from "react";
import { announceGauntletOverhaulAction } from "@/lib/gauntlet/announce-actions";

/** Posts the overhaul announcement to the cards channel. Two taps: the
 *  first arms it, the second sends — a channel-wide post is not a thing
 *  to fire by accident. */
export default function AnnounceGauntletButton() {
  const [armed, setArmed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!armed) {
      setArmed(true);
      return;
    }
    startTransition(async () => {
      const result = await announceGauntletOverhaulAction();
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
        {pending ? "Posting…" : armed ? "Tap again to post the announcement" : "Announce the Gauntlet overhaul in #cards"}
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
