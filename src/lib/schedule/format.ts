import { FIXTURE_STAGES, type FixtureRow, type FixtureStage } from "./types";

/**
 * Presentation metadata per stage, straight from the Split 5 rulebook:
 * 5 regular-season weeks of intra-division Bo3s (Mondays 8pm ET), a
 * two-round Bo1 gauntlet played on one day, then Quarterfinals (four Bo5s
 * on one day), Semifinals, and Finals.
 */
export interface StageMeta {
  stage: FixtureStage;
  label: string;
  group: "Regular Season" | "Gauntlet" | "Playoffs";
  bestOf: 1 | 3 | 5;
  note: string;
}

const week = (n: 1 | 2 | 3 | 4 | 5): StageMeta => ({
  stage: `week_${n}` as FixtureStage,
  label: `Week ${n}`,
  group: "Regular Season",
  bestOf: 3,
  note: "Intra-division Bo3",
});

export const STAGE_META: StageMeta[] = [
  week(1),
  week(2),
  week(3),
  week(4),
  week(5),
  {
    stage: "gauntlet_r1",
    label: "Gauntlet — Round 1",
    group: "Gauntlet",
    bestOf: 1,
    note: "Bo1 · 5th seeds vs opposite division's 6th seeds",
  },
  {
    stage: "gauntlet_r2",
    label: "Gauntlet — Round 2",
    group: "Gauntlet",
    bestOf: 1,
    note: "Bo1 · Round 1 winners vs the 4th seeds",
  },
  {
    stage: "quarterfinals",
    label: "Quarterfinals",
    group: "Playoffs",
    bestOf: 5,
    note: "Four Bo5s on one day",
  },
  {
    stage: "semifinals",
    label: "Semifinals",
    group: "Playoffs",
    bestOf: 5,
    note: "Bo5 · winners advance to Finals",
  },
  {
    stage: "finals",
    label: "Finals",
    group: "Playoffs",
    bestOf: 5,
    note: "Bo5 · winner is the split's champion",
  },
];

export function stageMeta(stage: FixtureStage): StageMeta {
  return STAGE_META.find((m) => m.stage === stage)!;
}

const STAGE_ORDER = new Map(FIXTURE_STAGES.map((s, i) => [s, i]));

/**
 * Group fixtures by stage in rulebook order. Every stage appears (with an
 * empty list when nothing is scheduled yet) so the page always shows the
 * full split structure with TBD slots, not just whatever rows exist.
 * Within a stage: sort_order, then division (Solari before Lunari, nulls
 * last), then creation order for stability.
 */
export function groupByStage(rows: FixtureRow[]): { meta: StageMeta; fixtures: FixtureRow[] }[] {
  // Rulebook order, not alphabetical: Solari, then Lunari, then
  // cross-division (null).
  const divisionRank = (d: FixtureRow["division"]) => (d === "Solari" ? 0 : d === "Lunari" ? 1 : 2);
  const sorted = [...rows].sort((a, b) => {
    const stageDiff = (STAGE_ORDER.get(a.stage) ?? 99) - (STAGE_ORDER.get(b.stage) ?? 99);
    if (stageDiff !== 0) return stageDiff;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    const divDiff = divisionRank(a.division) - divisionRank(b.division);
    if (divDiff !== 0) return divDiff;
    return a.created_at.localeCompare(b.created_at);
  });
  return STAGE_META.map((meta) => ({
    meta,
    fixtures: sorted.filter((r) => r.stage === meta.stage),
  }));
}

/**
 * League time is Eastern (matches play Mondays 8pm ET per the rulebook), so
 * dates render pinned to America/New_York with an explicit "ET" suffix
 * rather than floating to the viewer's timezone.
 */
export function formatKickoff(iso: string | null): string {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date TBD";
  const text = d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${text} ET`;
}

export function teamLabel(name: string | null): string {
  return name?.trim() ? name : "TBD";
}

/** True once both scores are reported (the DB check keeps them paired). */
export function hasResult(row: FixtureRow): boolean {
  return row.score_a !== null && row.score_b !== null;
}
