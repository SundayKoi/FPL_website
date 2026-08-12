"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import CompareDrawer from "./CompareDrawer";
import { RoleChip } from "./statsUi";

const MIN_GAMES_OPTIONS = [1, 3, 5, 8, 10] as const;
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
const MAX_COMPARE = 3;

type ColumnKey =
  | "player"
  | "role_mode"
  | "games"
  | "winrate_pct"
  | "kda"
  | "kda_avg"
  | "avg_kp_pct"
  | "avg_cs_per_min"
  | "avg_gold_per_min"
  | "avg_dmg_per_min"
  | "avg_dmg_share_pct"
  | "avg_vision_per_min";

type Column = {
  key: ColumnKey;
  label: string;
  numeric: boolean;
  sortValue: (row: PlayerAggRow) => number | string;
  display: (row: PlayerAggRow) => string;
};

// Column order per the brief: Player, Role, Games, WR%, KDA, K/D/A avg,
// KP%, CS/m, Gold/m, DMG/m, DMG%, VS/m. No team column (per-season
// ambiguous, explicitly skipped per the brief).
const COLUMNS: Column[] = [
  {
    key: "player",
    label: "Player",
    numeric: false,
    sortValue: (r) => `${r.summoner_name}#${r.tag}`.toLowerCase(),
    display: (r) => `${r.summoner_name}#${r.tag}`,
  },
  {
    key: "role_mode",
    label: "Role",
    numeric: false,
    sortValue: (r) => r.role_mode,
    display: (r) => r.role_mode,
  },
  {
    key: "games",
    label: "Games",
    numeric: true,
    sortValue: (r) => r.games,
    display: (r) => String(r.games),
  },
  {
    key: "winrate_pct",
    label: "WR%",
    numeric: true,
    sortValue: (r) => r.winrate_pct,
    display: (r) => `${r.winrate_pct.toFixed(1)}%`,
  },
  {
    key: "kda",
    label: "KDA",
    numeric: true,
    sortValue: (r) => r.kda,
    display: (r) => r.kda.toFixed(2),
  },
  {
    key: "kda_avg",
    label: "K/D/A avg",
    numeric: true,
    sortValue: (r) => r.avg_kills,
    display: (r) => `${r.avg_kills.toFixed(1)}/${r.avg_deaths.toFixed(1)}/${r.avg_assists.toFixed(1)}`,
  },
  {
    key: "avg_kp_pct",
    label: "KP%",
    numeric: true,
    sortValue: (r) => r.avg_kp_pct,
    display: (r) => `${r.avg_kp_pct.toFixed(1)}%`,
  },
  {
    key: "avg_cs_per_min",
    label: "CS/m",
    numeric: true,
    sortValue: (r) => r.avg_cs_per_min,
    display: (r) => r.avg_cs_per_min.toFixed(2),
  },
  {
    key: "avg_gold_per_min",
    label: "Gold/m",
    numeric: true,
    sortValue: (r) => r.avg_gold_per_min,
    display: (r) => r.avg_gold_per_min.toFixed(0),
  },
  {
    key: "avg_dmg_per_min",
    label: "DMG/m",
    numeric: true,
    sortValue: (r) => r.avg_dmg_per_min,
    display: (r) => r.avg_dmg_per_min.toFixed(0),
  },
  {
    key: "avg_dmg_share_pct",
    label: "DMG%",
    numeric: true,
    sortValue: (r) => r.avg_dmg_share_pct,
    display: (r) => `${r.avg_dmg_share_pct.toFixed(1)}%`,
  },
  {
    key: "avg_vision_per_min",
    label: "VS/m",
    numeric: true,
    sortValue: (r) => r.avg_vision_per_min,
    display: (r) => r.avg_vision_per_min.toFixed(2),
  },
];

type SortDir = "asc" | "desc";

function playerKey(row: PlayerAggRow): string {
  return `${row.summoner_name}#${row.tag}`;
}

export default function LeaderboardTab({
  season,
  phase,
  onSelectPlayer,
}: {
  season: string;
  phase: PhaseFilter;
  onSelectPlayer: (player: { summonerName: string; tag: string }) => void;
}) {
  const [rows, setRows] = useState<PlayerAggRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Render-phase adjust (see useCountdown): when the season/phase filter
  // changes, flip back to "loading" synchronously during render instead of
  // via a setState call in the effect body (react-hooks/set-state-in-effect
  // forbids the latter — see LeaderboardTab's brief note on the lint rule).
  const filterKey = `${season}::${phase}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setStatus("loading");
  }
  const [minGames, setMinGames] = useState(3);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ColumnKey>("kda");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);

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
  // phase="All" (the view emits one row per phase, so a single season with
  // both Regular and Playoffs games still returns 2 rows per player).
  // Games-weighted combine per formulas.ts `combineSeasonRows`.
  const merged = useMemo(() => {
    if (season !== ALL_SEASONS && phase !== "All") return rows;
    const seasonLabel = season === ALL_SEASONS ? "All" : season;
    return mergeRows(rows, playerKey, (group) => combineSeasonRows(group, seasonLabel));
  }, [rows, season, phase]);

  // No team filter: `stats_player_agg` has no team column (per-season
  // ambiguous — see brief), and there's no roster/team join to filter by
  // yet. A dropdown with a single permanently-selected "All" option reads
  // as broken, so it's omitted entirely; Task 7 can reintroduce a real one
  // if a team join lands.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged
      .filter((r) => r.games >= minGames)
      .filter((r) => !roleFilter || r.role_mode === roleFilter)
      .filter((r) => !q || playerKey(r).toLowerCase().includes(q));
  }, [merged, minGames, roleFilter, query]);

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

  const visible = useMemo(() => {
    if (!edge) return sorted;
    return edge === "top" ? sorted.slice(0, 10) : sorted.slice(-10).reverse();
  }, [sorted, edge]);

  const sortCol = COLUMNS.find((c) => c.key === sortKey)!;
  // Peak value of the active numeric sort column across visible rows — used
  // to scale the inline neon bar drawn behind that column's cells.
  const sortMax = useMemo(() => {
    if (!sortCol.numeric) return 0;
    return visible.reduce((m, r) => Math.max(m, Number(sortCol.sortValue(r))), 0);
  }, [visible, sortCol]);

  const handleSort = (key: ColumnKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(COLUMNS.find((c) => c.key === key)?.numeric ? "desc" : "asc");
    }
  };

  const toggleCompare = (row: PlayerAggRow) => {
    const key = playerKey(row);
    setCompareKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, key];
    });
  };

  const compareRows = compareKeys
    .map((key) => merged.find((r) => playerKey(r) === key))
    .filter((r): r is PlayerAggRow => !!r);

  if (status === "loading") {
    return (
      <div className="card-brand p-8 text-center text-steel" role="status">
        Loading leaderboard…
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card-brand p-8 text-center text-steel">
        Couldn&apos;t load leaderboard data. Try again shortly.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-2xl">No stats yet</p>
        <p className="mt-2 text-steel">There&apos;s no leaderboard data for this season/phase yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-cyan focus:outline-none focus:[box-shadow:0_0_10px_rgb(53_230_255/0.3)]"
          />

          <div className="ml-auto flex gap-1">
            <button
              type="button"
              aria-pressed={edge === "top"}
              onClick={() => setEdge((e) => (e === "top" ? null : "top"))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                edge === "top"
                  ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                  : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Top 10
            </button>
            <button
              type="button"
              aria-pressed={edge === "bottom"}
              onClick={() => setEdge((e) => (e === "bottom" ? null : "bottom"))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                edge === "bottom"
                  ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                  : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Bottom 10
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="mono-label mr-1">Min games</span>
            {MIN_GAMES_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={minGames === n}
                onClick={() => setMinGames(n)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  minGames === n
                    ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                    : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mono-label mr-1">Role</span>
            <button
              type="button"
              aria-pressed={roleFilter === null}
              onClick={() => setRoleFilter(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                roleFilter === null
                  ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                  : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              All
            </button>
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={roleFilter === r}
                onClick={() => setRoleFilter((cur) => (cur === r ? null : r))}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase transition ${
                  roleFilter === r
                    ? "bg-cyan text-navy [box-shadow:0_0_12px_rgb(53_230_255/0.4)]"
                    : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="card-brand p-8 text-center">
          <p className="type-display text-2xl">No stats yet</p>
          <p className="mt-2 text-steel">No players match these filters.</p>
        </div>
      ) : (
        <div className="card-neon overflow-x-auto p-2">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-cyan/20">
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-steel">
                  vs
                </th>
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-steel">
                  #
                </th>
                {COLUMNS.map((col) => {
                  const active = sortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      // Player column sticks while stats scroll sideways on
                      // phones (solid bg so scrolling cells pass beneath it).
                      className={`px-2 py-2 text-left ${
                        col.key === "player" ? "sticky left-0 z-10 bg-panel" : ""
                      }`}
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
              {visible.map((row, i) => {
                const key = playerKey(row);
                const checked = compareKeys.includes(key);
                // Top-3 shimmer only applies to a descending sort (an actual
                // ranking) with no edge/bottom filter reversing the order.
                const rankHighlight = !edge && sortDir === "desc" ? i + 1 : 0;
                const rankClass =
                  rankHighlight === 1
                    ? "row-rank-1"
                    : rankHighlight === 2
                      ? "row-rank-2"
                      : rankHighlight === 3
                        ? "row-rank-3"
                        : "";
                return (
                  <tr
                    key={key}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${row.summoner_name}#${row.tag} details`}
                    onClick={() => onSelectPlayer({ summonerName: row.summoner_name, tag: row.tag })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectPlayer({ summonerName: row.summoner_name, tag: row.tag });
                      }
                    }}
                    className={`cursor-pointer border-t border-line/50 transition hover:bg-cyan/5 ${rankClass}`}
                  >
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompare(row)}
                        disabled={!checked && compareKeys.length >= MAX_COMPARE}
                        aria-label={`Compare ${row.summoner_name}`}
                        className="h-4 w-4 accent-cyan"
                      />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs text-steel">{i + 1}</td>
                    {COLUMNS.map((col) => {
                      if (col.key === "role_mode") {
                        return (
                          <td key={col.key} className="px-2 py-1.5">
                            <RoleChip role={row.role_mode} />
                          </td>
                        );
                      }
                      // The active numeric sort column gets a faint neon bar
                      // behind its value, scaled to the peak in view.
                      const isSortedNumeric = col.key === sortKey && col.numeric && sortMax > 0;
                      if (isSortedNumeric) {
                        const pct = Math.max(0, Math.min(100, (Number(col.sortValue(row)) / sortMax) * 100));
                        return (
                          <td key={col.key} className="relative px-2 py-1.5">
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-1 left-0 rounded-r bg-cyan/15"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative font-mono font-semibold text-white">
                              {col.display(row)}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-1.5 ${
                            col.key === "player"
                              ? "sticky left-0 z-10 bg-panel font-semibold text-white"
                              : "font-mono text-steel"
                          }`}
                        >
                          {col.display(row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CompareDrawer
        players={compareRows}
        onRemove={(row) => toggleCompare(row)}
        onClose={() => setCompareKeys([])}
      />
    </div>
  );
}
