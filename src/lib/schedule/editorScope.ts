import type { FixtureRow } from "./types";

export function scopedFixtures(fixtures: FixtureRow[], season: string | null): FixtureRow[] {
  return season ? fixtures.filter((fixture) => fixture.season === season) : [];
}

export function findScopedFixture(
  fixtures: FixtureRow[],
  season: string | null,
  fixtureId: string | null,
): FixtureRow | null {
  if (!fixtureId || !season) return null;
  return scopedFixtures(fixtures, season).find((fixture) => fixture.id === fixtureId) ?? null;
}
