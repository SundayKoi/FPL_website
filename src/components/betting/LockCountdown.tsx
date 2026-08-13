"use client";
import { useEffect, useState } from "react";

function remaining(lockAt: string): number {
  return Math.max(0, Math.floor((new Date(lockAt).getTime() - Date.now()) / 1000));
}

function fmt(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** Ticking "Locks in m:ss" chip; shows only while betting is open. */
export function LockCountdown({ lockAt, status }: { lockAt: string; status: string }) {
  // Resync instantly when lockAt changes, without reading the clock inside
  // an effect body (flagged as an impure setState-in-effect) — the
  // BidControls.tsx "prevKey" pattern: compare-and-adjust during render.
  const [prevLockAt, setPrevLockAt] = useState(lockAt);
  const [secs, setSecs] = useState(() => remaining(lockAt));
  if (lockAt !== prevLockAt) {
    setPrevLockAt(lockAt);
    setSecs(remaining(lockAt));
  }

  useEffect(() => {
    const t = window.setInterval(() => setSecs(remaining(lockAt)), 1000);
    return () => window.clearInterval(t);
  }, [lockAt]);

  if (status !== "OPEN") return null;
  if (secs <= 0) return <span className="text-xs font-semibold text-red-400">Locking…</span>;
  return (
    <span
      className={"text-xs font-semibold " + (secs <= 300 ? "text-red-400" : "text-steel")}
      title="Betting locks"
    >
      ⏱ Locks in <b>{fmt(secs)}</b>
    </span>
  );
}
