// Shared team-name resolution for the captain surface. Fixtures store free-
// text team names by design (see the fixtures migration), so matching against
// `league_teams` is case-insensitive after trimming.

import type { LeagueTeam } from "@/lib/matches/types";

export function normalizeName(name: string | null): string {
  return (name ?? "").trim().toLowerCase();
}

/** Resolve a fixture's free-text team name to a league_teams id, if any matches. */
export function matchTeamId(teams: LeagueTeam[], name: string | null): string | null {
  const target = normalizeName(name);
  if (!target) return null;
  return teams.find((t) => normalizeName(t.name) === target)?.id ?? null;
}
