"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

function formatCountdown(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * "Next puzzle · 04:12:09 · midnight Eastern, 9:00 PM for you". Every daily
 * game resets on the same Eastern calendar (src/lib/dailyDay.ts); this is
 * the one place that says so, with the viewer's own clock beside it so
 * nobody has to convert.
 */
export default function ResetCountdown({ expiresAt, label = "Next puzzle" }: { expiresAt: string; label?: string }) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now());
  // The viewer's local clock is only known in the browser; the server
  // renders the Eastern line alone so the HTML never guesses a zone.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const local = mounted ? new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  useEffect(() => {
    const id = window.setInterval(() => setRemaining(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  return (
    <div className="rounded border border-border-subtle bg-surface px-4 py-3 text-right" data-testid="reset-countdown">
      <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-muted">{label}</span>
      <span className="font-mono text-xl text-gold" aria-live="polite">
        {formatCountdown(remaining)}
      </span>
      <span className="block text-xs text-muted">{local ? `Midnight Eastern · ${local} for you` : "Resets at midnight Eastern"}</span>
    </div>
  );
}
