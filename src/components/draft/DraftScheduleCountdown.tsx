"use client";

import { useSyncExternalStore } from "react";
import { getCountdownParts } from "@/lib/home/seasonState";
import { formatEasternDateTime } from "@/lib/draft/schedule";

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

function CountdownUnit({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`rounded border px-3 py-2 text-center ${accent ? "border-gold/40 bg-gold/10" : "border-line bg-navy/70"}`}>
      <span className={`block font-mono text-2xl font-bold ${accent ? "text-gold" : "text-white"}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-[0.14em] text-steel">{label}</span>
    </div>
  );
}

export default function DraftScheduleCountdown({
  startsAt,
  label,
  compact = false,
}: {
  startsAt: string | null;
  label?: string;
  compact?: boolean;
}) {
  const clock = useSyncExternalStore(subscribeToClock, getClockSnapshot, getServerClockSnapshot);
  const now = clock === 0 ? null : new Date(clock);

  if (!startsAt) {
    return <p className="text-sm text-steel">Not scheduled</p>;
  }

  const target = new Date(startsAt);
  const countdown = getCountdownParts(target, now ?? target);
  const complete = countdown.complete;
  const value = (number: number) => String(number).padStart(2, "0");

  return (
    <div aria-label="Draft start countdown" className={compact ? "mt-3" : "mt-5"}>
      {label && <span className="label-dash text-gold">{label}</span>}
      <p className="mt-2 text-sm text-steel">{formatEasternDateTime(startsAt)}</p>
      {complete ? (
        <p className="mt-3 font-display text-xl font-bold not-italic text-mint">Live now</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <CountdownUnit value={clock === 0 ? "—" : String(countdown.days)} label="Days" accent />
          <CountdownUnit value={clock === 0 ? "—" : value(countdown.hours)} label="Hours" />
          <CountdownUnit value={clock === 0 ? "—" : value(countdown.minutes)} label="Minutes" />
          <CountdownUnit value={clock === 0 ? "—" : value(countdown.seconds)} label="Seconds" />
        </div>
      )}
    </div>
  );
}
