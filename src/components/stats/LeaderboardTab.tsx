"use client";

import { useEffect, useMemo, useState } from "react";
import { combineSeasonRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg } from "@/lib/stats/queries";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import CompareDrawer from "./CompareDrawer";

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

export default function LeaderboardTab({ season, phase }: { season: string; phase: PhaseFilter }) {
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

  // "All seasons" merges each player's per-season rows into one combined
  // row (games-weighted), per formulas.ts `combineSeasonRows`.
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
      <div className="card-brand flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players…"
            className="rounded border border-line bg-navy px-2 py-1.5 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none"
          />

          <div className="ml-auto flex gap-1">
            <button
              type="button"
              aria-pressed={edge === "top"}
              onClick={() => setEdge((e) => (e === "top" ? null : "top"))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                edge === "top" ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Top 10
            </button>
            <button
              type="button"
              aria-pressed={edge === "bottom"}
              onClick={() => setEdge((e) => (e === "bottom" ? null : "bottom"))}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                edge === "bottom" ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              Bottom 10
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="label-dash">Min games</span>
            {MIN_GAMES_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={minGames === n}
                onClick={() => setMinGames(n)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  minGames === n ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
                }`}
              >
                {n}+
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="label-dash">Role</span>
            <button
              type="button"
              aria-pressed={roleFilter === null}
              onClick={() => setRoleFilter(null)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                roleFilter === null ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
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
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                  roleFilter === r ? "bg-gold text-navy" : "border border-line bg-panel text-steel hover:text-white"
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
        <div className="card-brand overflow-x-auto p-2">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-steel">Compare</th>
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
              {visible.map((row) => {
                const key = playerKey(row);
                const checked = compareKeys.includes(key);
                return (
                  <tr key={key} className="border-t border-line/60">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCompare(row)}
                        disabled={!checked && compareKeys.length >= MAX_COMPARE}
                        aria-label={`Compare ${row.summoner_name}`}
                        className="h-4 w-4 accent-gold"
                      />
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={`px-2 py-1.5 ${col.key === "player" ? "text-white" : "text-steel"}`}
                      >
                        {col.display(row)}
                      </td>
                    ))}
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
