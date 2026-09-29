import { normalizeName } from "@/lib/captain/teamNames";
import { formatKickoff, hasResult, stageMeta } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

/** The fixture fields a report form needs to offer a link. */
export type ReportFixture = Pick<
  FixtureRow,
  "id" | "stage" | "sort_order" | "team_a" | "team_b" | "scheduled_at" | "score_a" | "score_b"
>;

/**
 * The fixtures a report about `teamAName` vs `teamBName` could belong to, in
 * either orientation, earliest first. Two teams meet more than once in a
 * season (a regular-season week and a playoff round, a replayed series), so
 * this is a list, not a lookup.
 */
export function fixtureCandidates<T extends ReportFixture>(
  fixtures: readonly T[],
  teamAName: string | null,
  teamBName: string | null,
): T[] {
  const a = normalizeName(teamAName);
  const b = normalizeName(teamBName);
  if (!a || !b || a === b) return [];
  return fixtures
    .filter((fixture) => {
      const fa = normalizeName(fixture.team_a);
      const fb = normalizeName(fixture.team_b);
      return (fa === a && fb === b) || (fa === b && fb === a);
    })
    .sort((x, y) => {
      const xt = x.scheduled_at ? new Date(x.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
      const yt = y.scheduled_at ? new Date(y.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
      if (xt !== yt) return xt - yt;
      return x.sort_order - y.sort_order;
    });
}

/**
 * Which candidate a form should link to before anyone touches the picker.
 *
 * Keeps a choice already made if it is still on the list, then takes the
 * fixture the page was opened for (the team's next match), then the one
 * fixture still waiting for a result, then the one fixture the pair has at
 * all. The last rule is what lets a corrected series find its way back:
 * the fixture already carries the score the wrong report gave it, so a
 * "next unplayed match" rule would skip it forever and file the correction
 * against nothing — which is exactly how a semifinal ended up with a score,
 * no games, and no winner advanced. Anything more ambiguous is left blank
 * for the reporter to decide.
 */
export function defaultFixtureId(
  candidates: readonly ReportFixture[],
  currentId: string | null,
  preferredId: string | null,
): string {
  if (currentId && candidates.some((fixture) => fixture.id === currentId)) return currentId;
  if (preferredId && candidates.some((fixture) => fixture.id === preferredId)) return preferredId;
  const unplayed = candidates.filter((fixture) => !hasResult(fixture as FixtureRow));
  if (unplayed.length === 1) return unplayed[0].id;
  if (candidates.length === 1) return candidates[0].id;
  return "";
}

/** "Semifinals · A vs B · Mon, Sep 28, 8:00 PM ET · 3–2 recorded" */
export function fixtureOptionLabel(fixture: ReportFixture): string {
  const teams = `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`;
  const scored =
    fixture.score_a !== null && fixture.score_b !== null ? ` · ${fixture.score_a}–${fixture.score_b} recorded` : "";
  return `${stageMeta(fixture.stage).label} · ${teams} · ${formatKickoff(fixture.scheduled_at)}${scored}`;
}
