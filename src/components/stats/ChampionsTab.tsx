"use client";

import { useEffect, useMemo, useState } from "react";
import { combineChampionRows, mergeRows } from "@/lib/stats/formulas";
import { fetchChampionAgg } from "@/lib/stats/queries";
import type { ChampionAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import { StatBar } from "./statsUi";

const MIN_PICKS_OPTIONS = [1, 3, 5] as const;

type ColumnKey = "champion" | "picks" | "bans" | "presence_pct" | "winrate_pct" | "avg_kda";

type Column = {
  key: ColumnKey;
  label: string;
  numeric: boolean;
  sortValue: (row: ChampionAggRow) => number | string;
  display: (row: ChampionAggRow) => string;
};

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

type SortDir = "asc" | "desc";

export default function ChampionsTab({ season, phase }: { season: string; phase: PhaseFilter }) {
  const [rows, setRows] = useState<ChampionAggRow[]>([]);
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
  const [minPicks, setMinPicks] = useState(3);
  const [sortKey, setSortKey] = useState<ColumnKey>("picks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const seasonParam = season === ALL_SEASONS ? undefined : season;
        const phaseParam = phase === "All" ? undefined : phase;
        const data = await fetchChampionAgg(seasonParam, phaseParam);
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

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  };

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading champions…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load champion data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no champion data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-wrap items-center gap-1.5 p-4">
        <span className="mono-label mr-1">Min picks</span>
        {MIN_PICKS_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={minPicks === n}
            onClick={() => setMinPicks(n)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              minPicks === n
                ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                : "border border-line bg-panel text-steel hover:text-white"
            }`}
          >
            {n}+
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="card-brand p-8 text-center">
          <p className="type-display text-2xl">No stats yet</p>
          <p className="mt-2 text-steel">No champions match this filter.</p>
        </div>
      ) : (
        <div className="card-neon overflow-x-auto p-2">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-cyan/20">
                {COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      className="px-2 py-2 text-left"
                      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={`flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] transition ${
                          active ? "text-cyan [text-shadow:0_0_8px_rgb(53_230_255/0.4)]" : "text-steel hover:text-white"
                        }`}
                      >
                        {col.label}
                        {active && <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  );
                })}
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
