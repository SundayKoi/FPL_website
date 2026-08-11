"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows, mvpScores } from "@/lib/stats/formulas";
import { fetchPlayerAgg } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { RoleChip, StatBar } from "./statsUi";

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

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" — same pattern as LeaderboardTab, applied BEFORE feeding
  // the formula so the MVP min-games gate and cohort percentiles see one
  // row per player.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS && phase !== "All") return rows;
    const seasonLabel = season === ALL_SEASONS ? "All" : season;
    return mergeRows(rows, playerKey, (group) => combineSeasonRows(group, seasonLabel));
  }, [rows, season, phase]);

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
      <div className="card-neon p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <span className="float-soft text-2xl" aria-hidden="true">
            👑
          </span>
          <span className="mono-label">Most Valuable Player</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-display text-4xl sm:text-5xl">{leader.summoner_name}</p>
            <p className="mt-2 flex items-center gap-2 text-sm text-steel">
              <RoleChip role={leader.role_mode} />
              <span className="font-mono">
                {leader.games} games · {leader.winrate_pct.toFixed(1)}% WR
              </span>
            </p>
          </div>
          <p className="type-display glow-pulse text-6xl text-gold sm:text-7xl [text-shadow:0_0_24px_rgb(245_182_46/0.5)]">
            {leader.mvpScore}
          </p>
        </div>
        <StatBar value={leader.mvpScore} max={100} color="gold" className="mt-4" />
      </div>

      <div className="card-neon flex flex-col gap-1 p-2">
        {rest.map((entry, i) => (
          <div
            key={playerKey(entry)}
            className="flex flex-wrap items-center gap-3 border-t border-line/50 px-3 py-2.5 first:border-t-0 sm:flex-nowrap"
          >
            <span className="w-8 shrink-0 font-mono text-sm font-semibold text-steel">#{i + 2}</span>
            <div className="min-w-[9rem] flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                {entry.summoner_name}
                <RoleChip role={entry.role_mode} />
              </p>
              <p className="truncate font-mono text-xs text-steel">
                {entry.games}g · {entry.winrate_pct.toFixed(1)}% WR
              </p>
            </div>
            <StatBar value={entry.mvpScore} max={100} color="gold" className="w-full max-w-xs flex-1" />
            <span className="w-10 shrink-0 text-right font-mono text-base font-bold text-gold">
              {entry.mvpScore}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
