"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows, mvpScores } from "@/lib/stats/formulas";
import { fetchPlayerAgg } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";

function playerKey(row: PlayerAggRow): string {
  return `${row.summoner_name}#${row.tag}`;
}

export default function MvpTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const [rows, setRows] = useState<PlayerAggRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Render-phase adjust (see LeaderboardTab): flip back to "loading"
  // synchronously during render on filter change instead of via a setState
  // call in the effect body (react-hooks/set-state-in-effect forbids that).
  const filterKey = `${season}::${phase}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setStatus("loading");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasonParam = season === ALL_SEASONS ? undefined : season;
        const phaseParam = phase === "All" ? undefined : phase;
        const data = await fetchPlayerAgg(seasonParam, phaseParam);
        if (cancelled) return;
        setRows(data);
        setStatus("loaded");
      } catch {
        if (cancelled) return;
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [season, phase]);

  // "All seasons" merges each player's per-season rows into one combined
  // row (games-weighted), per formulas.ts `combineSeasonRows` — same
  // pattern as LeaderboardTab, applied BEFORE feeding the formula so the
  // MVP min-games gate and cohort percentiles see one row per player.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS) return rows;
    const byPlayer = new Map<string, PlayerAggRow[]>();
    for (const row of rows) {
      const key = playerKey(row);
      const list = byPlayer.get(key);
      if (list) list.push(row);
      else byPlayer.set(key, [row]);
    }
    return Array.from(byPlayer.values()).map((group) => combineSeasonRows(group));
  }, [rows, season]);

  // mvpScores applies its own built-in min-5-games gate before ranking.
  const ranked = useMemo(() => mvpScores(merged), [merged]);

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading MVP rankings…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load MVP data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no MVP data for this season/phase yet.</p>
      </div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No qualified players</p>
        <p className="mt-2 text-steel">MVP ranking requires at least 5 games played this season/phase.</p>
      </div>
    );
  }

  const [leader, ...rest] = ranked;

  return (
    <div className="flex flex-col gap-4">
      <div className="card-brand overflow-hidden p-6 sm:p-8">
        <span className="label-dash">Most Valuable Player</span>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-display text-4xl sm:text-5xl">{leader.summoner_name}</p>
            <p className="mt-1 text-sm text-steel">
              {leader.role_mode} · {leader.games} games · {leader.winrate_pct.toFixed(1)}% WR
            </p>
          </div>
          <p className="type-display text-6xl text-gold sm:text-7xl">{leader.mvpScore}</p>
        </div>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-navy">
          <div
            className="h-full rounded-full bg-gold"
            style={{ width: `${Math.max(0, Math.min(100, leader.mvpScore))}%` }}
          />
        </div>
      </div>

      <div className="card-brand flex flex-col gap-1 p-2">
        {rest.map((entry, i) => (
          <div
            key={playerKey(entry)}
            className="flex flex-wrap items-center gap-3 border-t border-line/60 px-3 py-2.5 first:border-t-0 sm:flex-nowrap"
          >
            <span className="w-8 shrink-0 text-sm font-semibold text-steel">#{i + 2}</span>
            <div className="min-w-[10rem] flex-1">
              <p className="truncate text-sm font-semibold text-white">{entry.summoner_name}</p>
              <p className="truncate text-xs text-steel">
                {entry.role_mode} · {entry.games}g · {entry.winrate_pct.toFixed(1)}% WR
              </p>
            </div>
            <div className="h-2 w-full max-w-xs flex-1 overflow-hidden rounded-full bg-navy">
              <div
                className="h-full rounded-full bg-gold/80"
                style={{ width: `${Math.max(0, Math.min(100, entry.mvpScore))}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-base font-bold text-gold">{entry.mvpScore}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
