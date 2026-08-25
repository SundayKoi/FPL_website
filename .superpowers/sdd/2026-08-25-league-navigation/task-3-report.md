# Task 3 implementation report: player-first header navigation

## Status

`DONE`

The header now exposes direct active-league links for Players, Teams,
Schedule, Stats, and My Team, with shared Play, Premium, and Info groups.
The FPL/FPL Academy brand chooser owns league switching and receives the
current pathname and query string. Staff links remain gated by the existing
server-provided props and appear in a separated Info menu section.

## Files

- `src/components/SiteNavigation.tsx`
  - Replaces Premier/Academy dropdowns with direct league-aware links.
  - Adds Play, Premium, and Info destinations, including staff links inside
    Info.
  - Integrates `LeagueBrandChooser` with pathname/search state while
    preserving menu dismissal, active-route, and mobile behavior.
- `src/components/SiteNavigation.test.tsx`
  - Covers the new information architecture, shared destinations, staff
    gating, chooser active state, dismissal, and responsive header behavior.

`src/app/layout.tsx` already passed the existing `authSlot`, `showAdmin`, and
`showBroadcaster` props and required no production change.

## Test-first evidence

The initial focused run failed because the old Premier/Academy structure was
still rendered. After the refactor:

```text
npm test -- src/components/SiteNavigation.test.tsx src/components/LeagueBrandChooser.test.tsx src/app/layout.test.tsx
Test Files  3 passed (3)
Tests       16 passed (16)
```

The repository lint command completed with no errors (one unrelated existing
`<img>` warning in `src/components/captain/scouting/ChampionDatum.tsx`).

## Review follow-up

Removed the redundant always-Premier root brand link. `LeagueBrandChooser` is
now the sole top-left league control, so Academy routes do not render a second
FPL brand or an accidental root league switcher.

Follow-up focused verification:

```text
npm test -- src/components/SiteNavigation.test.tsx src/components/LeagueBrandChooser.test.tsx src/app/layout.test.tsx
Test Files  3 passed (3)
Tests       17 passed (17)
```
