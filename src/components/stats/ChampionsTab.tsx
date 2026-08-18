"use client";

import { useCallback, useMemo, useState } from "react";
import { combineChampionRows, mergeRows } from "@/lib/stats/formulas";
import { fetchChampionAggForTeams } from "@/lib/stats/queries";
import type { ChampionAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { SortableHeaderCell, useSortableColumns, type SortableColumn } from "./sortableTable";
import { EmptyCard, ErrorCard, FilterPill, LoadingCard, StatBar } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

const MIN_PICKS_OPTIONS = [1, 3, 5] as const;

type ColumnKey = "champion" | "picks" | "bans" | "presence_pct" | "winrate_pct" | "avg_kda";

type Column = SortableColumn<ChampionAggRow, ColumnKey>;

const COLUMNS: Column[] = [
  {
    key: "champion",
    label: "Champion",
    numeric: false,
    sortValue: (r) => r.champion.toLowerCase(),
    display: (r) => r.champion,
  },
  {
    key: "picks",
    label: "Picks",
    numeric: true,
    sortValue: (r) => r.picks,
    display: (r) => String(r.picks),
  },
  {
    key: "bans",
    label: "Bans",
    numeric: true,
    sortValue: (r) => r.bans,
    display: (r) => String(r.bans),
  },
  {
    key: "presence_pct",
    label: "Presence%",
    numeric: true,
    sortValue: (r) => r.presence_pct,
    display: (r) => `${r.presence_pct.toFixed(1)}%`,
  },
  {
    key: "winrate_pct",
    label: "WR%",
    numeric: true,
    sortValue: (r) => r.winrate_pct,
    display: (r) => `${r.winrate_pct.toFixed(1)}%`,
  },
  {
    key: "avg_kda",
    label: "Avg KDA",
    numeric: true,
    sortValue: (r) => r.avg_kda,
    display: (r) => r.avg_kda.toFixed(2),
  },
];

export default function ChampionsTab({ season, phase, teamNames }: { season: string; phase: PhaseFilter; teamNames?: string[] }) {
  const loadRows = useCallback(() => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    return fetchChampionAggForTeams(seasonParam, phaseParam, teamNames);
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);
  const [minPicks, setMinPicks] = useState(3);
  const { sortKey, sortDir, handleSort, sortRows } = useSortableColumns(COLUMNS, "picks");

  // Merge whenever the fetch could span more than one (season,
  // season_phase) partition — "All seasons" OR a specific season with
  // phase="All" (the view emits one row per phase, so a single season with
  // both Regular and Playoffs games still returns 2 rows per champion).
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS && phase !== "All") return rows;
    const seasonLabel = season === ALL_SEASONS ? ALL_SEASONS : season;
    return mergeRows(rows, (r) => r.champion, (group) => combineChampionRows(group, seasonLabel));
  }, [rows, season, phase]);

  const filtered = useMemo(
    () => merged.filter((r) => r.picks >= minPicks),
    [merged, minPicks],
  );

  const sorted = useMemo(() => sortRows(filtered), [filtered, sortRows]);

  if (status === "loading") {
    return <LoadingCard label="champions" />;
  }

  if (status === "error") {
    return <ErrorCard noun="champion" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no champion data for this season/phase yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-wrap items-center gap-1.5 p-4">
        <span className="mono-label mr-1">Min picks</span>
        {MIN_PICKS_OPTIONS.map((n) => (
          <FilterPill key={n} active={minPicks === n} onClick={() => setMinPicks(n)}>
            {n}+
          </FilterPill>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyCard message="No champions match this filter." />
      ) : (
        <div className="card-neon overflow-x-auto p-2">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-cyan/20">
                {COLUMNS.map((col) => (
                  <SortableHeaderCell
                    key={col.key}
                    column={col}
                    active={sortKey === col.key}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.champion} className="border-t border-line/50 transition hover:bg-cyan/5">
                  {COLUMNS.map((col) => {
                    if (col.key === "presence_pct") {
                      return (
                        <td key={col.key} className="px-2 py-2">
                          <div className="flex min-w-[7rem] items-center gap-2">
                            <StatBar value={row.presence_pct} max={100} color="purple" className="flex-1" />
                            <span className="w-12 shrink-0 text-right font-mono text-xs text-white">
                              {row.presence_pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-2 ${
                          col.key === "champion" ? "font-semibold text-white" : "font-mono text-steel"
                        }`}
                      >
                        {col.display(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
