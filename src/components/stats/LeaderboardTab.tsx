"use client";

import { useCallback, useMemo, useState } from "react";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import { fetchPlayerAgg, fetchPlayerKeysForTeams } from "@/lib/stats/queries";
import { filterStatsRowsByPlayerKeys, playerKey } from "@/lib/stats/scope";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PhaseFilter } from "./SeasonSelect";
import { ALL_SEASONS } from "./SeasonSelect";
import CompareDrawer from "./CompareDrawer";
import { SortableHeaderCell, useSortableColumns, type SortableColumn } from "./sortableTable";
import { EmptyCard, ErrorCard, FilterPill, LoadingCard, RoleChip } from "./statsUi";
import { useStatsFetch } from "./useStatsFetch";

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
  | "avg_kills"
  | "avg_deaths"
  | "avg_assists"
  | "avg_kp_pct"
  | "avg_cs_per_min"
  | "avg_gold_per_min"
  | "avg_dmg_per_min"
  | "avg_dmg_share_pct"
  | "avg_dmg_taken_per_min"
  | "avg_vision_per_min"
  | "avg_cs_at_10"
  | "avg_gold_at_10"
  | "avg_xp_at_10"
  | "avg_solo_kills"
  | "total_solo_kills"
  | "total_plates"
  | "first_blood_involvements"
  | "total_doubles"
  | "total_triples"
  | "total_quadras"
  | "total_pentas"
  | "avg_game_duration";

type Column = SortableColumn<PlayerAggRow, ColumnKey>;

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
  {
    key: "avg_kills",
    label: "K/g",
    numeric: true,
    sortValue: (r) => r.avg_kills,
    display: (r) => r.avg_kills.toFixed(1),
  },
  {
    // Its own column at last. Deaths lived inside the K/D/A cell, which
    // sorts on kills — so the league's most and least death-prone players
    // were the one thing this table could not be ordered by.
    key: "avg_deaths",
    label: "D/g",
    numeric: true,
    sortValue: (r) => r.avg_deaths,
    display: (r) => r.avg_deaths.toFixed(1),
  },
  {
    key: "avg_assists",
    label: "A/g",
    numeric: true,
    sortValue: (r) => r.avg_assists,
    display: (r) => r.avg_assists.toFixed(1),
  },
  {
    key: "avg_dmg_taken_per_min",
    label: "DMG taken/m",
    numeric: true,
    sortValue: (r) => r.avg_dmg_taken_per_min,
    display: (r) => Math.round(r.avg_dmg_taken_per_min).toLocaleString(),
  },
  {
    key: "avg_cs_at_10",
    label: "CS@10",
    numeric: true,
    sortValue: (r) => r.avg_cs_at_10,
    display: (r) => r.avg_cs_at_10.toFixed(1),
  },
  {
    key: "avg_gold_at_10",
    label: "Gold@10",
    numeric: true,
    sortValue: (r) => r.avg_gold_at_10,
    display: (r) => Math.round(r.avg_gold_at_10).toLocaleString(),
  },
  {
    key: "avg_xp_at_10",
    label: "XP@10",
    numeric: true,
    sortValue: (r) => r.avg_xp_at_10,
    display: (r) => Math.round(r.avg_xp_at_10).toLocaleString(),
  },
  {
    key: "avg_solo_kills",
    label: "Solo/g",
    numeric: true,
    sortValue: (r) => r.avg_solo_kills,
    display: (r) => r.avg_solo_kills.toFixed(2),
  },
  {
    key: "total_solo_kills",
    label: "Solo",
    numeric: true,
    sortValue: (r) => r.total_solo_kills,
    display: (r) => String(r.total_solo_kills),
  },
  {
    key: "total_plates",
    label: "Plates",
    numeric: true,
    sortValue: (r) => r.total_plates,
    display: (r) => String(r.total_plates),
  },
  {
    key: "first_blood_involvements",
    label: "First bloods",
    numeric: true,
    sortValue: (r) => r.first_blood_involvements,
    display: (r) => String(r.first_blood_involvements),
  },
  {
    key: "total_doubles",
    label: "2K",
    numeric: true,
    sortValue: (r) => r.total_doubles,
    display: (r) => String(r.total_doubles),
  },
  {
    key: "total_triples",
    label: "3K",
    numeric: true,
    sortValue: (r) => r.total_triples,
    display: (r) => String(r.total_triples),
  },
  {
    key: "total_quadras",
    label: "4K",
    numeric: true,
    sortValue: (r) => r.total_quadras,
    display: (r) => String(r.total_quadras),
  },
  {
    key: "total_pentas",
    label: "PENTA",
    numeric: true,
    sortValue: (r) => r.total_pentas,
    display: (r) => String(r.total_pentas),
  },
  {
    key: "avg_game_duration",
    label: "Avg game",
    numeric: true,
    sortValue: (r) => r.avg_game_duration,
    display: (r) => `${r.avg_game_duration.toFixed(1)}m`,
  },
];

/** Shown until someone asks for more. The full set is 28 columns wide,
 *  which is a spreadsheet rather than a leaderboard; these are the ones
 *  the old table had, so nobody's default view changes. */
const DEFAULT_COLUMNS: ColumnKey[] = [
  "player",
  "role_mode",
  "games",
  "winrate_pct",
  "kda",
  "kda_avg",
  "avg_kp_pct",
  "avg_cs_per_min",
  "avg_gold_per_min",
  "avg_dmg_per_min",
  "avg_dmg_share_pct",
  "avg_vision_per_min",
];

/** Player and Role always show — a table of numbers with no name on the
 *  row is not a leaderboard. */
const PINNED_COLUMNS: ColumnKey[] = ["player", "role_mode"];

/** The optional columns, grouped so the picker reads as categories rather
 *  than one run of sixteen chips. */
const COLUMN_GROUPS: { title: string; keys: ColumnKey[] }[] = [
  { title: "Core", keys: ["games", "winrate_pct", "kda", "kda_avg", "avg_game_duration"] },
  { title: "Combat", keys: ["avg_kills", "avg_deaths", "avg_assists", "avg_kp_pct", "avg_solo_kills", "total_solo_kills", "first_blood_involvements"] },
  { title: "Damage", keys: ["avg_dmg_per_min", "avg_dmg_share_pct", "avg_dmg_taken_per_min"] },
  { title: "Economy", keys: ["avg_cs_per_min", "avg_gold_per_min", "avg_cs_at_10", "avg_gold_at_10", "avg_xp_at_10", "total_plates"] },
  { title: "Vision", keys: ["avg_vision_per_min"] },
  { title: "Multikills", keys: ["total_doubles", "total_triples", "total_quadras", "total_pentas"] },
];

export default function LeaderboardTab({
  season,
  phase,
  onSelectPlayer,
  teamNames,
}: {
  season: string;
  phase: PhaseFilter;
  onSelectPlayer: (player: { summonerName: string; tag: string }) => void;
  teamNames?: string[];
}) {
  const loadRows = useCallback(async () => {
    const seasonParam = season === ALL_SEASONS ? undefined : season;
    const phaseParam = phase === "All" ? undefined : phase;
    const data = await fetchPlayerAgg(seasonParam, phaseParam);
    const keys = teamNames ? await fetchPlayerKeysForTeams(teamNames) : null;
    return keys ? filterStatsRowsByPlayerKeys(data, keys) : data;
  }, [season, phase, teamNames]);
  const { data, status } = useStatsFetch(loadRows, `${season}::${phase}`);
  const rows = useMemo(() => data ?? [], [data]);
  const [minGames, setMinGames] = useState(3);
  const [shownColumns, setShownColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { sortKey, sortDir, handleSort, sortRows } = useSortableColumns(COLUMNS, "kda");
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null);
  const [compareKeys, setCompareKeys] = useState<string[]>([]);

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

  const sorted = useMemo(() => sortRows(filtered), [filtered, sortRows]);

  const visible = useMemo(() => {
    if (!edge) return sorted;
    return edge === "top" ? sorted.slice(0, 10) : sorted.slice(-10).reverse();
  }, [sorted, edge]);

  // COLUMNS' own order, not click order, so turning one on never
  // reshuffles the columns already there.
  const visibleColumns = useMemo(
    () => COLUMNS.filter((col) => PINNED_COLUMNS.includes(col.key) || shownColumns.includes(col.key)),
    [shownColumns],
  );

  const sortCol = COLUMNS.find((c) => c.key === sortKey)!;
  // Peak value of the active numeric sort column across visible rows — used
  // to scale the inline neon bar drawn behind that column's cells.
  const sortMax = useMemo(() => {
    if (!sortCol.numeric) return 0;
    return visible.reduce((m, r) => Math.max(m, Number(sortCol.sortValue(r))), 0);
  }, [visible, sortCol]);

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
    return <LoadingCard label="leaderboard" />;
  }

  if (status === "error") {
    return <ErrorCard noun="leaderboard" />;
  }

  if (rows.length === 0) {
    return <EmptyCard message="There's no leaderboard data for this season/phase yet." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card-neon flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
            placeholder="Search players…"
            className="rounded border border-border-strong bg-canvas px-2 py-1.5 text-sm text-white placeholder:text-muted/60 focus:border-action-text focus:outline-none focus:[box-shadow:0_0_10px_rgb(111_147_255/0.3)]"
          />

          <FilterPill active={pickerOpen} onClick={() => setPickerOpen((open) => !open)}>
            Stats ({visibleColumns.length})
          </FilterPill>

          <div className="ml-auto flex gap-1">
            <FilterPill active={edge === "top"} onClick={() => setEdge((e) => (e === "top" ? null : "top"))}>
              Top 10
            </FilterPill>
            <FilterPill active={edge === "bottom"} onClick={() => setEdge((e) => (e === "bottom" ? null : "bottom"))}>
              Bottom 10
            </FilterPill>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="mono-label mr-1">Min games</span>
            {MIN_GAMES_OPTIONS.map((n) => (
              <FilterPill key={n} active={minGames === n} onClick={() => setMinGames(n)}>
                {n}+
              </FilterPill>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="mono-label mr-1">Role</span>
            <FilterPill active={roleFilter === null} onClick={() => setRoleFilter(null)}>
              All
            </FilterPill>
            {ROLES.map((r) => (
              <FilterPill
                key={r}
                active={roleFilter === r}
                onClick={() => setRoleFilter((cur) => (cur === r ? null : r))}
                uppercase
              >
                {r}
              </FilterPill>
            ))}
          </div>
        </div>

        {pickerOpen ? (
          <div className="flex flex-col gap-3 border-t border-border-subtle/60 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-label">Columns</span>
              <button
                type="button"
                onClick={() => setShownColumns(COLUMNS.map((col) => col.key))}
                className="text-[11px] uppercase tracking-wide text-muted underline-offset-4 hover:text-action-text hover:underline"
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => setShownColumns(DEFAULT_COLUMNS)}
                className="text-[11px] uppercase tracking-wide text-muted underline-offset-4 hover:text-action-text hover:underline"
              >
                Reset
              </button>
            </div>
            {COLUMN_GROUPS.map((group) => (
              <div key={group.title} className="flex flex-wrap items-center gap-1.5">
                <span className="mono-label mr-1 w-20 shrink-0">{group.title}</span>
                {group.keys.map((key) => {
                  const column = COLUMNS.find((col) => col.key === key);
                  if (!column) return null;
                  const on = shownColumns.includes(key);
                  return (
                    <FilterPill
                      key={key}
                      active={on}
                      onClick={() =>
                        setShownColumns((current) => {
                          if (!current.includes(key)) return [...current, key];
                          // Sorting by a column you just hid would leave the
                          // table ordered by something invisible.
                          if (sortKey === key) handleSort("winrate_pct");
                          return current.filter((k) => k !== key);
                        })
                      }
                    >
                      {column.label}
                    </FilterPill>
                  );
                })}
              </div>
            ))}
            <p className="text-[11px] text-muted">
              Player and Role always show. Click any header to sort — a second click reverses it.
            </p>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyCard message="No players match these filters." />
      ) : (
        <div className="card-neon overflow-x-auto p-2">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle/70">
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  vs
                </th>
                <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  #
                </th>
                {visibleColumns.map((col) => (
                  <SortableHeaderCell
                    key={col.key}
                    column={col}
                    active={sortKey === col.key}
                    sortDir={sortDir}
                    onSort={handleSort}
                    // Player column sticks while stats scroll sideways on
                    // phones (solid bg so scrolling cells pass beneath it).
                    className={col.key === "player" ? "sticky left-0 z-10 bg-surface" : ""}
                  />
                ))}
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
                    className={`cursor-pointer border-t border-border-subtle/50 transition hover:bg-raised/50 ${rankClass}`}
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
                    <td className="px-2 py-1.5 font-mono text-xs text-muted">{i + 1}</td>
                    {visibleColumns.map((col) => {
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
                              ? "sticky left-0 z-10 bg-surface font-semibold text-white"
                              : "font-mono text-muted"
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
