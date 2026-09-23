// The board's clock and its two ways of printing a time. A plain module
// (no "use client"): the hook is only ever called from the board's client
// components, and the formatters are pure.

import { useSyncExternalStore } from "react";

/**
 * "1h 29m" / "4m 12s" / "" once it is due.
 *
 * Minute granularity above the hour on purpose: a seconds counter on a
 * 48-hour run is a spinning odometer nobody reads, and it would repaint the
 * whole board once a second for two days.
 */
export function untilLabel(msLeft: number): string {
  if (msLeft <= 0) return "";
  const seconds = Math.floor(msLeft / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return "seconds";
}

/** "Thu 3:10 PM" on the league's calendar. */
export function easternClock(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/**
 * The wall clock, as an external store rather than a `setInterval` writing
 * `useState`.
 *
 * It is genuinely EXTERNAL state and `useSyncExternalStore` is the hook for
 * that; and it is the only clock that hydrates safely: `getServerSnapshot`
 * hands the server render a 0, so the HTML says "back at 4:15 PM ET" — a
 * fact needing no clock — and only the hydrated browser swaps in a live
 * countdown. `readClock` caches to the second because getSnapshot MUST
 * return a stable value between reads or React re-renders forever.
 */
const CLOCK_TICK_MS = 1000;
let clockCache = 0;

function subscribeClock(onChange: () => void): () => void {
  const timer = setInterval(() => {
    clockCache = Date.now();
    onChange();
  }, CLOCK_TICK_MS);
  return () => clearInterval(timer);
}

function readClock(): number {
  const now = Date.now();
  if (now - clockCache >= CLOCK_TICK_MS) clockCache = now;
  return clockCache;
}

/** No clock on the server — 0 reads as "not mounted yet". */
function readServerClock(): number {
  return 0;
}

/** The ticking clock, or 0 during the server render and hydration. */
export function useClock(): number {
  return useSyncExternalStore(subscribeClock, readClock, readServerClock);
}
