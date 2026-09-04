import { normalizeTeamName } from "@/lib/league/context";
import { ALL_SEASONS, type PhaseFilter } from "@/components/stats/SeasonSelect";
import { combineTeamRows, mergeRows } from "./formulas";
import type { TeamAggRow } from "./types";

export type TeamRadarMetric = {
  key: "winrate_pct" | "dragon_rate" | "baron_rate" | "first_blood_rate" | "first_tower_rate";
  label: string;
  value: number;
};

function safePercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

/** Resolve a URL team query only against an exact, unambiguous team name. */
export function resolveTeamParam(
  rows: Pick<TeamAggRow, "team_name">[],
  query: string | null | undefined,
): string | null {
  const key = normalizeTeamName(query);
  if (!key) return null;

  const matches = rows.filter((row) => normalizeTeamName(row.team_name) === key);
  const canonicalNames = new Set(matches.map((row) => row.team_name.trim()));
  if (canonicalNames.size !== 1) return null;
  return [...canonicalNames][0];
}

/** Filter the requested scope and combine rows whenever it spans partitions. */
export function mergeTeamRowsForScope(
  rows: TeamAggRow[],
  season: string,
  phase: PhaseFilter,
): TeamAggRow[] {
  const scoped = rows.filter(
    (row) => (season === ALL_SEASONS || row.season === season) && (phase === "All" || row.season_phase === phase),
  );
  const spansPartitions = season === ALL_SEASONS || phase === "All";
  if (!spansPartitions) return scoped;
  return mergeRows(scoped, (row) => normalizeTeamName(row.team_name), (group) =>
    combineTeamRows(group, season === ALL_SEASONS ? ALL_SEASONS : season),
  );
}

export function teamRadarMetrics(row: TeamAggRow): TeamRadarMetric[] {
  return [
    { key: "winrate_pct", label: "Win rate", value: safePercentage(row.winrate_pct) },
    { key: "dragon_rate", label: "Dragon control", value: safePercentage(row.dragon_rate) },
    { key: "baron_rate", label: "Baron control", value: safePercentage(row.baron_rate) },
    { key: "first_blood_rate", label: "First blood", value: safePercentage(row.first_blood_rate) },
    { key: "first_tower_rate", label: "First tower", value: safePercentage(row.first_tower_rate) },
  ];
}
