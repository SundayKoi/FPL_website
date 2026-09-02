"use client";

import { useSyncExternalStore } from "react";
import { DRAFT_DAY_LABEL, getCountdownParts } from "@/lib/home/seasonState";

let currentTime = 0;

function subscribeToClock(onChange: () => void) {
  const update = () => {
    currentTime = Date.now();
    onChange();
  };
  const immediate = window.setTimeout(update, 0);
  const timer = window.setInterval(update, 1000);
  return () => {
    window.clearTimeout(immediate);
    window.clearInterval(timer);
  };
}

function getClockSnapshot() {
  return currentTime;
}

function getServerClockSnapshot() {
  return 0;
}

export default function PreseasonCountdown({ targetAt }: { targetAt: string }) {
  const target = new Date(targetAt);
  const clock = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const now = clock === 0 ? null : new Date(clock);

  const countdown = getCountdownParts(target, now ?? target);

  return (
    <div aria-label="Draft day countdown" className="mt-5">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className="label-dash text-prestige">Draft day</span>
        <span className="text-sm font-semibold text-white">{DRAFT_DAY_LABEL}</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
      <div className="rounded border border-prestige/40 bg-prestige/10 px-3 py-2 text-center">
        <span className="block font-mono text-2xl font-bold text-prestige">{now ? countdown.days : "—"}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Days</span>
      </div>
      <div className="rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center">
        <span className="block font-mono text-2xl font-bold text-white">{now ? String(countdown.hours).padStart(2, "0") : "—"}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Hours</span>
      </div>
      <div className="rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center">
        <span className="block font-mono text-2xl font-bold text-white">{now ? String(countdown.minutes).padStart(2, "0") : "—"}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Minutes</span>
      </div>
      <div className="rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center">
        <span className="block font-mono text-2xl font-bold text-league-secondary">{now ? String(countdown.seconds).padStart(2, "0") : "—"}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Seconds</span>
      </div>
      </div>
    </div>
  );
}
