// Pure fixture-resolution helper for the captain page's "Next match" card.
// No network, no Supabase — see .superpowers/sdd/2026-08-11-match-reporting-
// auto-ingest/task-5-brief.md and docs/superpowers/specs/2026-08-11-
// captains-page-design.md ("Page composition" step 1) for the rules.

import type { FixtureRow } from "@/lib/schedule/types";

function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/**
 * The earliest upcoming fixture for `teamName`: rows with no reported result
 * yet (`score_a` null — the fixtures table's own check constraint keeps
 * `score_a`/`score_b` paired, so this alone is enough) whose `team_a` or
 * `team_b` matches `teamName` case-insensitively after trimming (fixtures
 * are free text by design — see the fixtures migration). Sorted by
 * `scheduled_at` ascending with TBD (null) rows last, tie-broken by
 * `sort_order`. Returns null when nothing matches.
 */
export function pickNextFixture(fixtures: FixtureRow[], teamName: string): FixtureRow | null {
  const target = normalizeName(teamName);
  const upcoming = fixtures.filter(
    (f) => f.score_a === null && (normalizeName(f.team_a) === target || normalizeName(f.team_b) === target)
  );
  if (upcoming.length === 0) return null;

  const sorted = [...upcoming].sort((a, b) => {
    const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return a.sort_order - b.sort_order;
  });
  return sorted[0];
}
