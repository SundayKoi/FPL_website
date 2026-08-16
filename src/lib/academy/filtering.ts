import { normalizeTeamName } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";

export function filterAcademyFixtures(fixtures: FixtureRow[], teamNames: Set<string>): FixtureRow[] {
  return fixtures.filter((fixture) =>
    teamNames.has(normalizeTeamName(fixture.team_a)) || teamNames.has(normalizeTeamName(fixture.team_b)),
  );
}
