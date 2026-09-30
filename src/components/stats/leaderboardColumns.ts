// The leaderboard's columns: what each one sorts by and prints, which
// show by default, and how the picker groups the rest. Pure configuration;
// the table that reads it is LeaderboardTab.tsx.

import { formatLaneDiff } from "@/lib/stats/format";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { SortableColumn } from "./sortableTable";

export type ColumnKey =
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
  | "avg_cs_diff_10"
  | "avg_gold_diff_10"
  | "avg_xp_diff_10"
  | "avg_cs_diff_15"
  | "avg_gold_diff_15"
  | "avg_xp_diff_15"
  | "avg_cs_diff_20"
  | "avg_gold_diff_20"
  | "avg_xp_diff_20"
  | "avg_solo_kills"
  | "total_kills"
  | "total_deaths"
  | "total_assists"
  | "total_solo_kills"
  | "total_plates"
  | "first_blood_involvements"
  | "total_doubles"
  | "total_triples"
  | "total_quadras"
  | "total_pentas"
  | "avg_game_duration";

type Column = SortableColumn<PlayerAggRow, ColumnKey>;

/**
 * Laning, as a difference against the lane opponent at each mark.
 *
 * These read off stats_player_agg's diff columns (migration
 * 20261008000001), which resolve the opponent as the other row in the same
 * game, in the same role, on the other side. They replaced the old CS@10 /
 * Gold@10 / XP@10 averages here because a raw at-10 number is not
 * comparable across roles or game lengths, which is exactly what a
 * leaderboard column is for.
 *
 * A null diff is a mark nobody reached, or a game with no opposite number
 * logged — not an even lane. It displays as "—" and sorts to the far end,
 * so a descending sort ranks measured lanes and leaves the unmeasured at
 * the bottom rather than mixing them in at zero.
 */
const LANE_COLUMNS: Column[] = ([10, 15, 20] as const).flatMap((mark) => {
  const column = (
    key: ColumnKey,
    label: string,
    pick: (r: PlayerAggRow) => number | null | undefined,
    digits: 0 | 1,
  ): Column => ({
    key,
    label,
    numeric: true,
    // An unmeasured lane sorts to the far end rather than sitting among the
    // even ones at zero, so a descending sort ranks the lanes that exist.
    sortValue: (r) => {
      const value = pick(r);
      return typeof value === "number" && Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
    },
    display: (r) => formatLaneDiff(pick(r), digits),
  });
  return [
    column(`avg_cs_diff_${mark}` as ColumnKey, `CSD@${mark}`, (r) => r[`avg_cs_diff_${mark}`], 1),
    column(`avg_gold_diff_${mark}` as ColumnKey, `GD@${mark}`, (r) => r[`avg_gold_diff_${mark}`], 0),
    column(`avg_xp_diff_${mark}` as ColumnKey, `XPD@${mark}`, (r) => r[`avg_xp_diff_${mark}`], 0),
  ];
});

// Column order per the brief: Player, Role, Games, WR%, KDA, K/D/A avg,
// KP%, CS/m, Gold/m, DMG/m, DMG%, VS/m. No team column (per-season
// ambiguous, explicitly skipped per the brief).
export const COLUMNS: Column[] = [
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
  ...LANE_COLUMNS,
  {
    key: "avg_solo_kills",
    label: "Solo/g",
    numeric: true,
    sortValue: (r) => r.avg_solo_kills,
    display: (r) => r.avg_solo_kills.toFixed(2),
  },
  {
    key: "total_kills",
    label: "K",
    numeric: true,
    sortValue: (r) => r.total_kills,
    display: (r) => String(r.total_kills),
  },
  {
    key: "total_deaths",
    label: "D",
    numeric: true,
    sortValue: (r) => r.total_deaths,
    display: (r) => String(r.total_deaths),
  },
  {
    key: "total_assists",
    label: "A",
    numeric: true,
    sortValue: (r) => r.total_assists,
    display: (r) => String(r.total_assists),
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
export const DEFAULT_COLUMNS: ColumnKey[] = [
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
export const PINNED_COLUMNS: ColumnKey[] = ["player", "role_mode"];

/** The optional columns, grouped so the picker reads as categories rather
 *  than one run of sixteen chips. */
export const COLUMN_GROUPS: { title: string; keys: ColumnKey[] }[] = [
  { title: "Core", keys: ["games", "winrate_pct", "kda", "kda_avg", "avg_game_duration"] },
  { title: "Combat", keys: ["total_kills", "total_deaths", "total_assists", "avg_kills", "avg_deaths", "avg_assists", "avg_kp_pct", "avg_solo_kills", "total_solo_kills", "first_blood_involvements"] },
  { title: "Damage", keys: ["avg_dmg_per_min", "avg_dmg_share_pct", "avg_dmg_taken_per_min"] },
  { title: "Economy", keys: ["avg_cs_per_min", "avg_gold_per_min", "total_plates"] },
  {
    title: "Laning (diff vs opponent)",
    keys: [
      "avg_cs_diff_10", "avg_gold_diff_10", "avg_xp_diff_10",
      "avg_cs_diff_15", "avg_gold_diff_15", "avg_xp_diff_15",
      "avg_cs_diff_20", "avg_gold_diff_20", "avg_xp_diff_20",
    ],
  },
  { title: "Vision", keys: ["avg_vision_per_min"] },
  { title: "Multikills", keys: ["total_doubles", "total_triples", "total_quadras", "total_pentas"] },
];
