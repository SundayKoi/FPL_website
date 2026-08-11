"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchChampionAgg } from "@/lib/stats/queries";
import type { ChampionAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";

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

/**
 * Games-weighted-by-picks merge of a champion's per-season
 * stats_champion_agg rows into one "All seasons" row. Same treatment as
 * `combineSeasonRows`/`combineTeamRows`: counting columns (picks, bans,
 * games_in_scope) summed; winrate_pct and avg_kda recomputed from summed
 * wins/kda-implied totals rather than naively averaged. presence_pct is
 * recomputed from summed (picks+bans) over summed games_in_scope, matching
 * the view's own formula.
 */
function combineChampionRows(rows: ChampionAggRow[]): ChampionAggRow {
  if (rows.length === 1) return rows[0];
  const totalPicks = rows.reduce((s, r) => s + r.picks, 0);
  const totalBans = rows.reduce((s, r) => s + r.bans, 0);
  const totalGamesInScope = rows.reduce((s, r) => s + r.games_in_scope, 0);
  const totalWins = rows.reduce((s, r) => s + Math.round((r.winrate_pct / 100) * r.picks), 0);
  // avg_kda per row is (kills+assists)/max(deaths,1) for that row's picks;
  // reconstruct each row's implied deaths from its kda and pick count isn't
  // exact (kda is already rounded), so weight by picks as the best available
  // proxy for game count per season, consistent with the "weighted mean"
  // treatment used elsewhere for average-shaped columns.
  const weightedKda =
    totalPicks > 0 ? rows.reduce((s, r) => s + r.avg_kda * r.picks, 0) / totalPicks : 0;

  const first = rows[0];
  return {
    ...first,
    season: ALL_SEASONS,
    picks: totalPicks,
    bans: totalBans,
    games_in_scope: totalGamesInScope,
    wins: totalWins,
    winrate_pct: totalPicks > 0 ? Math.round((100 * totalWins) / totalPicks * 10) / 10 : 0,
    avg_kda: Math.round(weightedKda * 100) / 100,
    presence_pct:
      totalGamesInScope > 0
        ? Math.round((100 * (totalPicks + totalBans)) / totalGamesInScope * 10) / 10
        : 0,
  };
}

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

  const merged = useMemo(() => {
    if (season !== ALL_SEASONS) return rows;
    const byChampion = new Map<string, ChampionAggRow[]>();
    for (const row of rows) {
      const list = byChampion.get(row.champion);
      if (list) list.push(row);
      else byChampion.set(row.champion, [row]);
    }
    return Array.from(byChampion.values()).map(combineChampionRows);
  }, [rows, season]);

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
      <div className="card-brand flex flex-wrap items-center gap-1.5 p-4">
        <span className="label-dash">Min picks</span>
        {MIN_PICKS_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={minPicks === n}
            onClick={() => setMinPicks(n)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              minPicks === n ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
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
        <div className="card-brand overflow-x-auto p-2">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
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
                        className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
                          active ? "text-gold" : "text-steel hover:text-white"
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
                <tr key={row.champion} className="border-t border-line/60">
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-2 py-1.5 ${col.key === "champion" ? "font-semibold text-white" : "text-steel"}`}
                    >
                      {col.display(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
