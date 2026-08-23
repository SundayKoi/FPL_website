# Task 5 report: Captain-page opponent scouting

Implemented fault-isolated opponent scouting on the shared Captain page used by both Premier and Academy routes.

## Changes

- Starts `fetchScoutingHistory` concurrently with the existing opponent roster read when a next fixture and normalized opponent are available.
- Builds the client-safe `ScoutSource` with the selected league context, current season, next fixture, opponent name, and current opponent `draftPlayers` mapped to `{ id, displayName, role }`.
- Renders `OpponentScout` immediately below `NextMatchCard` for all captains; premium labeling remains presentation-only.
- Renders a compact unavailable card when the scouting query rejects, while preserving the rest of the Captain page.
- Added integration coverage for Premier, Academy, no fixture, rejected query, and admin-selected-team behavior.

## Verification

- `npm test -- src/app/captain/page.test.tsx src/components/captain/OpponentScout.test.tsx src/lib/scouting/queries.test.ts src/lib/scouting/derive.test.ts` — 27 passed.
- `npm run lint` — no errors; one existing `@next/next/no-img-element` warning in `src/components/captain/scouting/ChampionDatum.tsx`.
- `npx tsc --noEmit` — blocked by the existing unrelated `src/app/layout.tsx:27` `LayoutProps` error.
