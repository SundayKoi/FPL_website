import { hasResult } from "@/lib/schedule/format";
import type { FixtureRow } from "@/lib/schedule/types";

/** URL-safe slug for a team name ("Neon Dynasty" -> "neon-dynasty"). */
export function teamSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Loose name match: teams are text across fixtures/stats, not FK-joined. */
export function sameTeam(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface TeamFixtures {
  upcoming: FixtureRow[];
  results: FixtureRow[];
}

/**
 * Split a team's fixtures into unplayed (soonest first — what's next) and
 * played (most recent first — the results feed). Undated unplayed fixtures
 * sort last; they're TBD placeholders.
 */
export function splitTeamFixtures(rows: FixtureRow[], team: string): TeamFixtures {
  const mine = rows.filter((r) => sameTeam(r.team_a, team) || sameTeam(r.team_b, team));
  const upcoming = mine
    .filter((r) => !hasResult(r))
    .sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
  const results = mine
    .filter(hasResult)
    .sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? ""));
  return { upcoming, results };
}

export interface TeamRecord {
  wins: number;
  losses: number;
  seriesPlayed: number;
}

export interface TeamGameRecord {
  wins: number;
  losses: number;
  gamesPlayed: number;
}

type TeamRecordFixture = Pick<FixtureRow, "team_a" | "team_b" | "score_a" | "score_b">;

/** Series win/loss record from reported fixture scores. */
export function teamRecord(rows: TeamRecordFixture[], team: string): TeamRecord {
  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    if (row.score_a === null || row.score_b === null) continue;
    const isA = sameTeam(row.team_a, team);
    const isB = sameTeam(row.team_b, team);
    if (!isA && !isB) continue;
    const mine = isA ? row.score_a : row.score_b;
    const theirs = isA ? row.score_b : row.score_a;
    if (mine > theirs) wins += 1;
    else if (theirs > mine) losses += 1;
  }
  return { wins, losses, seriesPlayed: wins + losses };
}

/** Individual game win/loss record from reported fixture scores. */
export function teamGameRecord(rows: TeamRecordFixture[], team: string): TeamGameRecord {
  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    if (row.score_a === null || row.score_b === null) continue;
    const isA = sameTeam(row.team_a, team);
    const isB = sameTeam(row.team_b, team);
    if (!isA && !isB) continue;
    wins += isA ? row.score_a : row.score_b;
    losses += isA ? row.score_b : row.score_a;
  }
  return { wins, losses, gamesPlayed: wins + losses };
}

/** The other side of a fixture, from one team's perspective. */
export function opponentOf(row: FixtureRow, team: string): string {
  const isA = sameTeam(row.team_a, team);
  const other = isA ? row.team_b : row.team_a;
  return other?.trim() ? other : "TBD";
}

/** Did this team win the (reported) series? Null when unplayed. */
export function didWin(row: FixtureRow, team: string): boolean | null {
  if (!hasResult(row)) return null;
  const isA = sameTeam(row.team_a, team);
  const mine = isA ? row.score_a : row.score_b;
  const theirs = isA ? row.score_b : row.score_a;
  if (mine === theirs) return null;
  return mine > theirs;
}
