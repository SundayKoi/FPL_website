"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchGameLog } from "@/lib/stats/queries";
import type { GameLogRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";

function nightKey(row: GameLogRow): string {
  // Calendar-date grouping ("game night") — truncate the ISO timestamp to
  // its date portion so games played the same evening (different
  // clock-times) land in one night, regardless of timezone formatting.
  return row.game_date.slice(0, 10);
}

function formatNight(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatDuration(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TimelineTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const [rows, setRows] = useState<GameLogRow[]>([]);
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
        const data = await fetchGameLog(seasonParam, phaseParam);
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

  // Group by calendar date ("game night"), newest night first; within a
  // night, games ordered newest-first by their own timestamp.
  const nights = useMemo(() => {
    const byNight = new Map<string, GameLogRow[]>();
    for (const row of rows) {
      const key = nightKey(row);
      const list = byNight.get(key);
      if (list) list.push(row);
      else byNight.set(key, [row]);
    }
    return Array.from(byNight.entries())
      .map(([key, games]) => ({
        key,
        games: [...games].sort((a, b) => b.game_date.localeCompare(a.game_date)),
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [rows]);

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading timeline…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load timeline data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no game log data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {nights.map((night) => (
        <div key={night.key} className="card-neon flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-cyan/20 pb-2">
            <p className="type-display text-xl">{formatNight(night.key)}</p>
            <span className="mono-label">
              {night.games.length} {night.games.length === 1 ? "game" : "games"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line/50">
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan">
                    Blue
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-pink">
                    Red
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                    Winner
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                    Duration
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                    Kills
                  </th>
                </tr>
              </thead>
              <tbody>
                {night.games.map((game) => (
                  <tr key={game.match_id} className="border-t border-line/50 transition hover:bg-cyan/5">
                    <td
                      className={`px-2 py-1.5 ${game.winner_team === game.blue_team ? "font-semibold text-cyan" : "text-steel"}`}
                    >
                      {game.blue_team}
                    </td>
                    <td
                      className={`px-2 py-1.5 ${game.winner_team === game.red_team ? "font-semibold text-pink" : "text-steel"}`}
                    >
                      {game.red_team}
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-gold">
                      <span className="mr-1" aria-hidden="true">
                        ▸
                      </span>
                      {game.winner_team}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-steel">{formatDuration(game.duration_min)}</td>
                    <td className="px-2 py-1.5 font-mono text-steel">{game.total_kills}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
