"use client";

import { useCallback, useMemo } from "react";
import { formatDuration } from "@/lib/stats/format";
import { fetchGameLog } from "@/lib/stats/queries";
import { filterTimelineRowsByTeams } from "@/lib/stats/scope";
import { normalizeTeamName } from "@/lib/league/context";
import type { GameLogRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { EmptyCard, ErrorCard, LoadingCard } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

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

export default function TimelineTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
  const loadRows = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    const data = await fetchGameLog(seasonParam, phaseParam);
    const names = teamNames ? new Set(teamNames.map(normalizeTeamName)) : null;
    return names ? filterTimelineRowsByTeams(data, names) : data;
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);

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
    return <LoadingCard label="timeline" />;
  }

  if (status === "error") {
    return <ErrorCard noun="timeline" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no game log data for this season/phase yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {nights.map((night) => (
        <div key={night.key} className="card-neon flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 pb-2">
            <p className="type-display text-xl">{formatNight(night.key)}</p>
            <span className="mono-label">
              {night.games.length} {night.games.length === 1 ? "game" : "games"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan">
                    Blue
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-pink">
                    Red
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Winner
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Duration
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    Kills
                  </th>
                </tr>
              </thead>
              <tbody>
                {night.games.map((game) => (
                  <tr key={game.match_id} className="border-t border-border/50 transition hover:bg-raised/50">
                    <td
                      className={`px-2 py-1.5 ${game.winner_team === game.blue_team ? "font-semibold text-cyan" : "text-muted"}`}
                    >
                      {game.blue_team}
                    </td>
                    <td
                      className={`px-2 py-1.5 ${game.winner_team === game.red_team ? "font-semibold text-pink" : "text-muted"}`}
                    >
                      {game.red_team}
                    </td>
                    <td className="px-2 py-1.5 font-semibold text-gold">
                      <span className="mr-1" aria-hidden="true">
                        ▸
                      </span>
                      {game.winner_team}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted">{formatDuration(game.duration_min)}</td>
                    <td className="px-2 py-1.5 font-mono text-muted">{game.total_kills}</td>
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
