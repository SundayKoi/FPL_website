# Task 1 implementation report: pure league navigation helpers

## Status

`DONE`

The pure league-path helpers and direct header-link contract are implemented
with explicit paired prefixes. Query strings are preserved only when the
pathname is a recognized paired league route; unknown shared routes fall back
to the target league home.

## Files

- `src/lib/league/links.ts`
  - Adds `resolveLeagueFromPath`.
  - Adds `pairedLeagueHref` with longest-prefix matching for canonical Premier
    and Academy routes, nested suffix preservation, and query preservation.
- `src/lib/league/links.test.ts`
  - Covers roots, nested team/player paths, My Team/scouting, unknown shared
    routes, paired queries, and same-league links.
- `src/lib/league/navigation.ts`
  - Adds `leagueNavigationLinks` for Players, Teams, Schedule, Stats, and My
    Team.
- `src/lib/league/navigation.test.ts`
  - Verifies Academy destinations and labels.

## Test-first evidence

Initial focused run failed as expected because the new exports and navigation
module did not exist:

```text
npm test -- src/lib/league/links.test.ts src/lib/league/navigation.test.ts
2 failed test files; missing navigation module and helper exports
```

Final focused run:

```text
npm test -- src/lib/league/links.test.ts src/lib/league/navigation.test.ts
Test Files  2 passed (2)
Tests       6 passed (6)
```

Additional verification:

```text
npx eslint src/lib/league/links.ts src/lib/league/navigation.ts src/lib/league/links.test.ts src/lib/league/navigation.test.ts
exit 0

git diff --check
exit 0
```
