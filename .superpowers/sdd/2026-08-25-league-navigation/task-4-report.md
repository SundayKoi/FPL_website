# Task 4 implementation report: remove page-level league toggles

## Status

`DONE`

Removed the obsolete `LeaguePageToggle` component and all routed imports and
renders. The shared FPL/FPL Academy brand chooser in the site navigation is
now the only league switcher. Existing page titles, filters, query parameters,
admin team selectors, and content behavior remain intact.

## Files

- Removed toggle usage from home, Players, Teams, Stats, Schedule, My Team,
  and My Team Scouting views, including Academy routes.
- Removed the obsolete `pageView` and `HomeDashboard.view` props and their
  callers.
- Removed stale toggle mocks and replaced the Teams test's toggle-specific
  assertions with page-content coverage.
- Added `src/lib/league/noPageToggle.test.ts`, which checks every routed source
  file for absence of the removed import.

## Verification

```text
npm test -- src/components/home/FeaturedHomepageCopy.test.tsx src/components/players/PlayersDirectory.test.tsx src/components/teams/TeamsDirectory.test.tsx src/app/captain/scouting/page.test.tsx src/lib/league/navigation.test.ts src/lib/league/noPageToggle.test.ts src/app/my-team/page.test.tsx src/app/my-team/scouting/page.test.tsx
Test Files  8 passed (8)
Tests       37 passed (37)

npm run lint
0 errors; one pre-existing warning in src/components/captain/scouting/ChampionDatum.tsx
```
