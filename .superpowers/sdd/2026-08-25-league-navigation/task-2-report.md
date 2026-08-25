# Task 2 implementation report: FPL Academy league chooser

## Status

`DONE`

The responsive brand chooser is implemented as an accessible client component
with FPL and FPL Academy treatments. It preserves recognized paired routes and
query strings when switching leagues, sends the active league to its home,
and supports Escape, outside-click dismissal, keyboard-reachable links, and
the `onNavigate` callback.

## Files

- `src/components/LeagueBrandChooser.tsx`
  - Renders the active FPL/FPL Academy trigger and labeled `League chooser`
    menu.
  - Uses `/fpl-logo.png` in both treatments and a decorative cyan Academy `A`
    badge.
  - Consumes `resolveLeagueFromPath` and `pairedLeagueHref` from Task 1.
- `src/components/LeagueBrandChooser.test.tsx`
  - Covers both brand states, links, query behavior, callback, Escape, and
    outside-click dismissal.
- `src/app/globals.css`
  - Adds opaque menu, mark layout, and cyan Academy badge styling.

## Test-first evidence

Initial focused run failed as expected because the component did not exist:

```text
npm test -- src/components/LeagueBrandChooser.test.tsx
Failed to resolve import "./LeagueBrandChooser"
```

Final focused run:

```text
npm test -- src/components/LeagueBrandChooser.test.tsx
Test Files  1 passed (1)
Tests       4 passed (4)
```

Additional verification:

```text
npx eslint src/components/LeagueBrandChooser.tsx src/components/LeagueBrandChooser.test.tsx
exit 0
```

The broader `npm test` run still has one unrelated pre-existing failure in
`src/components/teams/AdminTeamEditor.test.tsx`.
