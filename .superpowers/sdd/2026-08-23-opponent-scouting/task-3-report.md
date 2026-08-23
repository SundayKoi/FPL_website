# Task 3 Report

## Status

Complete. Added `fetchScoutingHistory` with compact fixture and match-draft selections, active-league fixture filtering, safe JSON mapping, and fixture-scoped draft history.

## Tests

- `npm test -- src/lib/scouting/queries.test.ts src/lib/scouting/derive.test.ts` — PASS (9 tests)
- `npx eslint src/lib/scouting/queries.ts src/lib/scouting/queries.test.ts` — PASS
- `git diff --check` — PASS
- `npx tsc --noEmit --pretty false` — reports the pre-existing `src/app/layout.tsx(27,56): Cannot find name 'LayoutProps'`; no scouting query errors.

## Concerns

- The loader intentionally fetches all fixture/draft rows visible to the cookie-bound client and applies the active-league boundary in memory. This preserves historical rows needed for all-history and former-team attribution while avoiding free-text opponent filters in PostgREST.
- Draft rows with non-array `actions` become `[]`; non-object `positions` become `null`; malformed rows missing required identifiers are ignored.
