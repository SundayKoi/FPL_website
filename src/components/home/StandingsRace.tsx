"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RaceWeek } from "@/lib/home/standings";

const ROW_HEIGHT = 44;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sortedEntries(week: RaceWeek) {
  return [...week.entries].sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name),
  );
}

/**
 * The standings race: one animated bar per team, re-sorting week over week.
 * Rows are absolutely positioned by rank and transition top/width, so
 * stepping through weeks reads as teams climbing and sliding. "Replay
 * season" auto-plays from week 1; reduced-motion visitors get instant
 * position changes (no transitions) and no auto-play.
 */
export default function StandingsRace({ race }: { race: RaceWeek[] }) {
  const [index, setIndex] = useState(race.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const week = race[Math.min(index, race.length - 1)];
  const maxWins = useMemo(
    () => Math.max(1, ...race.flatMap((frame) => frame.entries.map((entry) => entry.wins))),
    [race],
  );
  // Rank per team id for the current frame — drives each row's `top`.
  const ranks = useMemo(() => {
    const map = new Map<string, number>();
    if (week) sortedEntries(week).forEach((entry, rank) => map.set(entry.id, rank));
    return map;
  }, [week]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIndex((current) => {
        if (current >= race.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 1400);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, race.length]);

  if (race.length === 0 || !week) return null;
  const teams = week.entries;

  return (
    <article aria-labelledby="standings-race-title" className="card-brand flex min-h-0 flex-col overflow-hidden p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="label-dash">THE SEASON SO FAR</span>
          <h2 id="standings-race-title" className="type-display mt-2 text-3xl sm:text-4xl">
            Standings race
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            if (prefersReducedMotion()) {
              setIndex(race.length - 1);
              return;
            }
            setIndex(0);
            setPlaying(true);
          }}
          className="shrink-0 rounded-full border border-primary/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary transition hover:bg-primary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ▶ Replay season
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Week">
        {race.map((frame, frameIndex) => (
          <button
            key={frame.stage}
            type="button"
            role="tab"
            aria-selected={frameIndex === index}
            onClick={() => {
              setPlaying(false);
              setIndex(frameIndex);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              frameIndex === index
                ? "bg-primary text-white"
                : "border border-border bg-surface text-muted hover:text-white"
            }`}
          >
            {frame.label}
          </button>
        ))}
      </div>

      <div className="relative mt-5" style={{ height: teams.length * ROW_HEIGHT }}>
        {teams.map((entry) => {
          const rank = ranks.get(entry.id) ?? 0;
          const width = Math.max(6, (entry.wins / maxWins) * 100);
          return (
            <div
              key={entry.id}
              className="absolute inset-x-0 flex items-center gap-3 transition-[top] duration-700 ease-out motion-reduce:transition-none"
              style={{ top: rank * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <span className="w-5 shrink-0 font-mono text-xs font-semibold text-muted">#{rank + 1}</span>
              <span className="w-10 shrink-0 font-mono text-xs font-bold text-league-accent">{entry.abbreviation}</span>
              <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-canvas/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-league-accent/70 to-league-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-xs font-semibold text-white">
                {entry.wins}–{entry.losses}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] uppercase tracking-[0.1em] text-muted/70">
        Cumulative series records through {week.label}
      </p>
    </article>
  );
}
