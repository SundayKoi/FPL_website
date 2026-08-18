"use client";

import { useCallback } from "react";
import { combineTeamRows, mergeRows } from "@/lib/stats/formulas";
import { formatDuration } from "@/lib/stats/format";
import { fetchTeamAgg } from "@/lib/stats/queries";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, LoadingCard, StatBar } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

export default function TeamsTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
  const loadRows = useCallback(() => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    return fetchTeamAgg(seasonParam, phaseParam, teamNames);
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = data ?? [];

  if (status === "loading") {
    return <LoadingCard label="teams" />;
  }

  if (status === "error") {
    return <ErrorCard noun="team" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no team data for this season/phase yet." />;
  }

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" (the view emits one row per phase, so a single season with
  // both Regular and Playoffs games still returns 2 rows per team).
  const merged =
    season !== ALL_SEASONS && phase !== "All"
      ? rows
      : mergeRows(rows, (r) => r.team_name, (group) =>
          combineTeamRows(group, season === ALL_SEASONS ? ALL_SEASONS : season),
        );

  const sorted = [...merged].sort((a, b) => {
    if (b.winrate_pct !== a.winrate_pct) return b.winrate_pct - a.winrate_pct;
    return b.games - a.games;
  });

  const headClass =
    "px-2 py-2 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-steel";

  return (
    <div className="card-neon overflow-x-auto p-2">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-cyan/20">
            <th className={headClass}>Team</th>
            <th className={headClass}>Win Rate</th>
            <th className={headClass}>Games</th>
            <th className={headClass}>W</th>
            <th className={headClass}>L</th>
            <th className={headClass}>Avg Duration</th>
            <th className={headClass}>Dragon%</th>
            <th className={headClass}>Baron%</th>
            <th className={headClass}>FB%</th>
            <th className={headClass}>FT%</th>
            <th className={headClass}>Avg Kills</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.team_name}
              className={`border-t border-line/50 transition hover:bg-cyan/5 ${i === 0 ? "row-rank-1" : ""}`}
            >
              <td className="px-2 py-2 font-semibold text-white">
                {i === 0 && <span className="mr-1.5 font-mono text-gold">#1</span>}
                {row.team_name}
              </td>
              <td className="px-2 py-2">
                <div className="flex min-w-[8rem] items-center gap-2">
                  <StatBar
                    value={row.winrate_pct}
                    max={100}
                    color={i === 0 ? "gold" : "cyan"}
                    className="flex-1"
                  />
                  <span className="w-12 shrink-0 text-right font-mono text-xs font-bold text-white">
                    {row.winrate_pct.toFixed(1)}%
                  </span>
                </div>
              </td>
              <td className="px-2 py-2 font-mono text-steel">{row.games}</td>
              <td className="px-2 py-2 font-mono text-mint">{row.wins}</td>
              <td className="px-2 py-2 font-mono text-pink">{row.losses}</td>
              <td className="px-2 py-2 font-mono text-steel">{formatDuration(row.avg_duration_min)}</td>
              <td className="px-2 py-2 font-mono text-steel">{row.dragon_rate.toFixed(1)}%</td>
              <td className="px-2 py-2 font-mono text-steel">{row.baron_rate.toFixed(1)}%</td>
              <td className="px-2 py-2 font-mono text-steel">{row.first_blood_rate.toFixed(1)}%</td>
              <td className="px-2 py-2 font-mono text-steel">{row.first_tower_rate.toFixed(1)}%</td>
              <td className="px-2 py-2 font-mono text-steel">{row.avg_team_kills.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
