"use client";

import { useEffect, useState } from "react";
import { fetchTeamAgg } from "@/lib/stats/queries";
import type { TeamAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";

/**
 * Games-weighted merge of a team's per-season stats_team_agg rows into one
 * "All seasons" row. Same treatment as `combineSeasonRows` in formulas.ts
 * (see that migration's header comment): counting columns (games, wins,
 * losses) summed; rate columns (winrate_pct, avg_duration_min, dragon_rate,
 * baron_rate, first_blood_rate, first_tower_rate, avg_team_kills)
 * games-weighted mean rather than a naive average, to avoid Simpson's
 * paradox across seasons with different game counts.
 */
function combineTeamRows(rows: TeamAggRow[]): TeamAggRow {
  if (rows.length === 1) return rows[0];
  const totalGames = rows.reduce((s, r) => s + r.games, 0);
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);
  const totalLosses = rows.reduce((s, r) => s + r.losses, 0);
  const weightedMean = (pick: (r: TeamAggRow) => number): number => {
    const sum = rows.reduce((s, r) => s + pick(r) * r.games, 0);
    return Math.round((sum / totalGames) * 100) / 100;
  };
  const first = rows[0];
  return {
    ...first,
    season: ALL_SEASONS,
    games: totalGames,
    wins: totalWins,
    losses: totalLosses,
    winrate_pct: Math.round(((100 * totalWins) / totalGames) * 10) / 10,
    avg_duration_min: weightedMean((r) => r.avg_duration_min),
    dragon_rate: weightedMean((r) => r.dragon_rate),
    baron_rate: weightedMean((r) => r.baron_rate),
    first_blood_rate: weightedMean((r) => r.first_blood_rate),
    first_tower_rate: weightedMean((r) => r.first_tower_rate),
    avg_team_kills: weightedMean((r) => r.avg_team_kills),
  };
}

function formatDuration(min: number): string {
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TeamsTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const [rows, setRows] = useState<TeamAggRow[]>([]);
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
        const data = await fetchTeamAgg(seasonParam, phaseParam);
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

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading teams…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load team data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no team data for this season/phase yet.</p>
      </div>
    );
  }

  // "All seasons" merges each team's per-season rows into one combined row.
  const merged =
    season !== ALL_SEASONS
      ? rows
      : (() => {
          const byTeam = new Map<string, TeamAggRow[]>();
          for (const row of rows) {
            const list = byTeam.get(row.team_name);
            if (list) list.push(row);
            else byTeam.set(row.team_name, [row]);
          }
          return Array.from(byTeam.values()).map(combineTeamRows);
        })();

  const sorted = [...merged].sort((a, b) => {
    if (b.winrate_pct !== a.winrate_pct) return b.winrate_pct - a.winrate_pct;
    return b.games - a.games;
  });

  return (
    <div className="card-brand overflow-x-auto p-2">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Team
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Games
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              W
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              L
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              WR%
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Avg Duration
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Dragon%
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Baron%
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              FB%
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              FT%
            </th>
            <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-steel">
              Avg Kills
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.team_name} className="border-t border-line/60">
              <td className="px-2 py-1.5 font-semibold text-white">
                {i === 0 && <span className="mr-1.5 text-gold">#1</span>}
                {row.team_name}
              </td>
              <td className="px-2 py-1.5 text-steel">{row.games}</td>
              <td className="px-2 py-1.5 text-steel">{row.wins}</td>
              <td className="px-2 py-1.5 text-steel">{row.losses}</td>
              <td className="px-2 py-1.5 text-steel">{row.winrate_pct.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-steel">{formatDuration(row.avg_duration_min)}</td>
              <td className="px-2 py-1.5 text-steel">{row.dragon_rate.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-steel">{row.baron_rate.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-steel">{row.first_blood_rate.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-steel">{row.first_tower_rate.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-steel">{row.avg_team_kills.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
