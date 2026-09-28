"use client";

import { useSecondClock } from "@/hooks/useSecondClock";
import { DRAFT_DAY_LABEL, getCountdownParts } from "@/lib/home/seasonState";
import type { HomeAppearance } from "./appearance";
import styles from "./HomeWorkspace.module.css";

export default function PreseasonCountdown({ targetAt, appearance = "legacy" }: { targetAt: string; appearance?: HomeAppearance }) {
  const workspace = appearance === "workspace";
  const target = new Date(targetAt);
  const clock = useSecondClock();
  const now = clock === 0 ? null : new Date(clock);

  const countdown = getCountdownParts(target, now ?? target);

  return (
    <div aria-label="Draft day countdown" className="mt-5" data-appearance={appearance}>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <span className={workspace ? styles.eyebrow : "label-dash text-prestige"}>Draft day</span>
        <span className={`text-sm font-semibold ${workspace ? styles.ink : "text-white"}`}>{DRAFT_DAY_LABEL}</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
      <div className={workspace ? styles.countdownUnit : "rounded border border-prestige/40 bg-prestige/10 px-3 py-2 text-center"}>
        <span className={`block ${workspace ? styles.countdownValue : "font-mono text-2xl font-bold text-prestige"}`}>{now ? countdown.days : "—"}</span>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${workspace ? styles.muted : "text-muted"}`}>Days</span>
      </div>
      <div className={workspace ? styles.countdownUnit : "rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center"}>
        <span className={`block ${workspace ? styles.countdownValue : "font-mono text-2xl font-bold text-white"}`}>{now ? String(countdown.hours).padStart(2, "0") : "—"}</span>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${workspace ? styles.muted : "text-muted"}`}>Hours</span>
      </div>
      <div className={workspace ? styles.countdownUnit : "rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center"}>
        <span className={`block ${workspace ? styles.countdownValue : "font-mono text-2xl font-bold text-white"}`}>{now ? String(countdown.minutes).padStart(2, "0") : "—"}</span>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${workspace ? styles.muted : "text-muted"}`}>Minutes</span>
      </div>
      <div className={workspace ? styles.countdownUnit : "rounded border border-border-subtle bg-canvas/70 px-3 py-2 text-center"}>
        <span className={`block ${workspace ? styles.countdownValue : "font-mono text-2xl font-bold text-league-secondary"}`}>{now ? String(countdown.seconds).padStart(2, "0") : "—"}</span>
        <span className={`text-[10px] uppercase tracking-[0.14em] ${workspace ? styles.muted : "text-muted"}`}>Seconds</span>
      </div>
      </div>
    </div>
  );
}
