import { normalizeTeamName } from "@/lib/league/context";
import type { FixtureRow } from "@/lib/schedule/types";

/** Academy does not play a gauntlet: its split runs regular season into playoffs. */
const ACADEMY_EXCLUDED_STAGES = new Set(["gauntlet_r1", "gauntlet_r2"]);

export function filterAcademyFixtures(fixtures: FixtureRow[], teamNames: Set<string>): FixtureRow[] {
  return fixtures.filter(
    (fixture) =>
      !ACADEMY_EXCLUDED_STAGES.has(fixture.stage) &&
      (teamNames.has(normalizeTeamName(fixture.team_a)) || teamNames.has(normalizeTeamName(fixture.team_b))),
  );
}
