import { normalizeName } from "@/lib/captain/teamNames";
import type { LeagueTeam } from "@/lib/matches/types";

interface LeagueFixturePair {
  team_a: string | null;
  team_b: string | null;
}

function containsBoth<T>(values: ReadonlySet<T>, teamA: T, teamB: T): boolean {
  return values.has(teamA) && values.has(teamB);
}

/** Exact name-based boundary for fixture-shaped rows, including compact
 * scouting rows whose free-text team names can be null. */
export function createLeagueFixtureScope(teamNames: Iterable<string>) {
  const names = new Set([...teamNames].map(normalizeName).filter(Boolean));

  return {
    includesFixture(fixture: LeagueFixturePair): boolean {
      return containsBoth(names, normalizeName(fixture.team_a), normalizeName(fixture.team_b));
    },
  };
}

/** Builds one exact scope for a selected featured draft. Both sides must be
 * inside this set: one-sided historical or malformed rows must not become
 * next matches, scouting targets, or editor inputs for the other league. */
export function createLeagueTeamScope(teams: LeagueTeam[]) {
  const fixtureScope = createLeagueFixtureScope(teams.map((team) => team.name));
  const ids = new Set(teams.map((team) => team.id));

  return {
    includesFixture: fixtureScope.includesFixture,
    includesTeamPair(teamAId: string, teamBId: string): boolean {
      return containsBoth(ids, teamAId, teamBId);
    },
    includesTeamId(teamId: string): boolean {
      return ids.has(teamId);
    },
  };
}
