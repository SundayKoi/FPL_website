import { normalizeName } from "@/lib/captain/teamNames";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";

function containsBoth<T>(values: ReadonlySet<T>, teamA: T, teamB: T): boolean {
  return values.has(teamA) && values.has(teamB);
}

/** Builds one exact scope for a selected featured draft. Both sides must be
 * inside this set: one-sided historical or malformed rows must not become
 * next matches, scouting targets, or editor inputs for the other league. */
export function createLeagueTeamScope(teams: LeagueTeam[]) {
  const names = new Set(teams.map((team) => normalizeName(team.name)));
  const ids = new Set(teams.map((team) => team.id));

  return {
    includesFixture(fixture: Pick<FixtureRow, "team_a" | "team_b">): boolean {
      return containsBoth(names, normalizeName(fixture.team_a), normalizeName(fixture.team_b));
    },
    includesTeamPair(teamAId: string, teamBId: string): boolean {
      return containsBoth(ids, teamAId, teamBId);
    },
    includesTeamId(teamId: string): boolean {
      return ids.has(teamId);
    },
  };
}
