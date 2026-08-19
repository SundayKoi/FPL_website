"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import type { WeeklyStandout } from "@/lib/stats/weekly";

type WeeklyStandoutsProps = {
  standouts: WeeklyStandout[];
};

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function roleLabel(role: string): string {
  return role === "UTILITY" ? "SUPPORT" : role;
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-navy/70 px-2.5 py-1.5 text-center">
      <p className="font-mono text-sm font-bold text-white">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.14em] text-steel">{label}</p>
    </div>
  );
}

/**
 * Weekly standouts as an auto-rotating spotlight: the featured player card
 * cycles every few seconds (paused on hover, off for reduced motion), and
 * the ranked list doubles as the picker.
 */
export default function WeeklyStandouts({ standouts }: WeeklyStandoutsProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const featured = standouts[Math.min(index, standouts.length - 1)] ?? null;

  useEffect(() => {
    if (paused || standouts.length < 2) return;
    if (prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % standouts.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [paused, standouts.length]);

  return (
    <article
      aria-labelledby="weekly-standouts-title"
      className="card-brand flex min-h-0 flex-col justify-between overflow-hidden p-5 sm:p-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="label-dash">POWER RANKINGS</span>
            <h2 id="weekly-standouts-title" className="type-display mt-2 text-3xl sm:text-4xl">
              Latest Week&apos;s Standouts
            </h2>
          </div>
          <span className="shrink-0 rounded-full bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
            Power score
          </span>
        </div>

        {standouts.length === 0 || !featured ? (
          <p className="mt-5 max-w-md text-sm leading-6 text-steel">
            Weekly standouts will appear here once the latest match stats are available.
          </p>
        ) : (
          <>
            <div className="relative mt-6 overflow-hidden rounded-lg border border-line bg-gradient-to-br from-panel to-navy p-5">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan/60 bg-navy font-mono text-sm font-bold text-cyan">
                  {featured.summoner_name.slice(0, 3).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-semibold text-white">{featured.summoner_name}</p>
                  <p className="font-mono text-xs uppercase tracking-[0.12em] text-steel">
                    #{index + 1} this week · {roleLabel(featured.role_mode)} · {featured.games} games
                  </p>
                </div>
                <div className="text-right">
                  <CountUp
                    value={featured.score}
                    decimals={1}
                    className="type-display glow-pulse block text-5xl text-cyan"
                  />
                  <p className="text-[10px] uppercase tracking-[0.16em] text-steel">Weekly power</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatChip label="KDA" value={featured.kda.toFixed(2)} />
                <StatChip label="Win rate" value={`${featured.winrate_pct.toFixed(0)}%`} />
                <StatChip label="KP" value={`${featured.avg_kp_pct.toFixed(0)}%`} />
                <StatChip label="DMG/min" value={featured.avg_dmg_per_min.toFixed(0)} />
              </div>
              {standouts.length > 1 && (
                <div className="mt-4 flex justify-center gap-1.5">
                  {standouts.map((player, dotIndex) => (
                    <button
                      key={`${player.summoner_name}-${player.tag}`}
                      type="button"
                      aria-label={`Show ${player.summoner_name}`}
                      aria-current={dotIndex === index}
                      onClick={() => setIndex(dotIndex)}
                      className={`h-1.5 rounded-full transition-all ${
                        dotIndex === index ? "w-6 bg-cyan" : "w-1.5 bg-line hover:bg-steel"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col">
              {standouts.map((player, playerIndex) => (
                <button
                  key={`${player.summoner_name}-${player.tag}`}
                  type="button"
                  onClick={() => setIndex(playerIndex)}
                  aria-current={playerIndex === index}
                  className={`grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-t border-line/50 px-1 py-2.5 text-left transition first:border-t-0 ${
                    playerIndex === index ? "bg-cyan/5" : "hover:bg-line/20"
                  }`}
                >
                  <span className="font-mono text-sm font-semibold text-steel">#{playerIndex + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{player.summoner_name}</span>
                    <span className="block font-mono text-xs text-steel">
                      {roleLabel(player.role_mode)} · {player.games}g · {player.kda.toFixed(2)} KDA
                    </span>
                  </span>
                  <span className="type-display text-2xl text-cyan">{player.score.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Link
        href="/stats"
        className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-coral hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
      >
        View full stats <span aria-hidden>→</span>
      </Link>
    </article>
  );
}
