"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HomeAppearance } from "@/components/home/appearance";
import styles from "./UpNextBanner.module.css";

/** "in 3d 4h" / "in 45m" / "live now" for a future kickoff instant. */
export function countdownLabel(kickoffMs: number, nowMs: number): string {
  const diff = kickoffMs - nowMs;
  if (diff <= 0) return "awaiting result";
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${Math.max(1, mins)}m`;
}

function Countdown({ kickoff, appearance }: { kickoff: string; appearance: HomeAppearance | "league" }) {
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
    <span className={appearance === "league" ? styles.countdown : "rounded-full bg-action-fill px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"}>
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
  appearance = "legacy",
  href,
}: {
  stageId: string;
  href?: string;
  stageLabel: string;
  kickoffText: string;
  kickoff: string | null;
  count: number;
  appearance?: HomeAppearance | "league";
}) {
  return (
    <Link
      href={href ?? `#${stageId}`}
      className={appearance === "league" ? styles.upNext : "card-brand mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-action-text/40 p-4 transition hover:border-action-text sm:p-5"}
      data-appearance={appearance}
    >
      <span className={appearance === "league" ? styles.label : "label-dash shrink-0"}>Up next</span>
      <span className={appearance === "league" ? styles.title : "type-display text-2xl"}>{stageLabel}</span>
      <span className={appearance === "league" ? styles.info : "text-sm text-muted"}>
        {kickoffText}
        {count > 0 && ` · ${count} series`}
      </span>
      <span className={appearance === "league" ? styles.right : "ml-auto flex items-center gap-3"}>
        {kickoff && <Countdown kickoff={kickoff} appearance={appearance} />}
        <span aria-hidden="true" className={appearance === "league" ? styles.down : "text-muted"}>
          ↓
        </span>
      </span>
    </Link>
  );
}
