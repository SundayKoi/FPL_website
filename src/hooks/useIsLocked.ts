"use client";
import { useEffect, useState } from "react";

function computeLocked(status: string, lockAt: string): boolean {
  return status !== "OPEN" || Date.now() >= new Date(lockAt).getTime();
}

/**
 * Whether betting on a market is currently locked. Flips to true the instant
 * `lock_at` passes, even before the server-side `lock_due_markets` cron
 * catches up and flips `status` — `place_bet`/`cashout_bet` are
 * server-authoritative regardless (see the RPCs' own lock_at checks); this
 * only gates the UI early so the BetPanel doesn't invite a doomed bet.
 *
 * Reads the clock (`Date.now()`), which the React Compiler's purity rule
 * disallows calling directly in a component body — kept in state instead,
 * updated via a lazy useState initializer (mount) and a single timeout that
 * fires right at lock_at (not a 1s poll like LockCountdown.tsx, since this
 * only needs one flip from false to true).
 */
export function useIsLocked(status: string, lockAt: string): boolean {
  const [key, setKey] = useState(`${status}:${lockAt}`);
  const [locked, setLocked] = useState(() => computeLocked(status, lockAt));
  const nextKey = `${status}:${lockAt}`;
  if (nextKey !== key) {
    setKey(nextKey);
    setLocked(computeLocked(status, lockAt));
  }

  useEffect(() => {
    if (locked) return;
    const ms = new Date(lockAt).getTime() - Date.now();
    const t = window.setTimeout(() => setLocked(true), Math.max(0, ms));
    return () => window.clearTimeout(t);
  }, [lockAt, locked]);

  return locked;
}
