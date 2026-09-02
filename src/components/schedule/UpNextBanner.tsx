"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/** "in 3d 4h" / "in 45m" / "live now" for a future kickoff instant. */
export function countdownLabel(kickoffMs: number, nowMs: number): string {
  const diff = kickoffMs - nowMs;
  if (diff <= 0) return "live now";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${Math.max(1, mins)}m`;
}

function Countdown({ kickoff }: { kickoff: string }) {
  // Computed only after mount (and re-computed each minute): the server
  // and client clocks differ, so rendering this during SSR would hydrate
  // mismatched text.
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const kickoffMs = new Date(kickoff).getTime();
    const update = () => setLabel(countdownLabel(kickoffMs, Date.now()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [kickoff]);
  if (!label) return null;
  return (
    <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
      {label}
    </span>
  );
}

/**
 * "Up Next" spotlight at the top of the schedule: the next match night
 * (stage label, kickoff pinned to ET, series count, live countdown),
 * linking to that stage's card further down the page.
 */
export default function UpNextBanner({
  stageId,
  stageLabel,
  kickoffText,
  kickoff,
  count,
}: {
  stageId: string;
  stageLabel: string;
  kickoffText: string;
  kickoff: string | null;
  count: number;
}) {
  return (
    <Link
      href={`#${stageId}`}
      className="card-brand mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-primary/40 p-4 transition hover:border-primary sm:p-5"
    >
      <span className="label-dash shrink-0">Up next</span>
      <span className="type-display text-2xl">{stageLabel}</span>
      <span className="text-sm text-muted">
        {kickoffText}
        {count > 0 && ` · ${count} series`}
      </span>
      <span className="ml-auto flex items-center gap-3">
        {kickoff && <Countdown kickoff={kickoff} />}
        <span aria-hidden="true" className="text-muted">
          ↓
        </span>
      </span>
    </Link>
  );
}
