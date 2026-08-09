# Board Layout for 12 Teams + First-Class Custom Bids

**Date:** 2026-08-09
**Status:** Approved
**Scope:** Two board changes: (1) restructure `/draft/[id]` so 12 teams fit — teams move to a grid below the player pool, with the captain's own team pinned in a left rail; (2) make custom bids first-class — fix the stale-amount bug and give the input a labeled, prominent treatment.

## Layout

- Live/paused board order (top → bottom): CenterStage + BidFeed row (unchanged) → PlayerPool (full width) → **all teams in a responsive grid** (`grid-cols-2` mobile → up to `xl:grid-cols-6`) under a new `label-dash` section heading `TEAMS`.
- **Left rail (captains only):** the signed-in captain's own `TeamColumn` pinned `sticky top-*` in a left column (~w-64) beside the main content, visible while scrolling. Spectators and team-less admins get no rail — main content spans full width.
- `TeamColumn` component unchanged (reused in both rail and grid). Nominator gold edge + my-team ring unchanged. Completion summary (`FinalRosters`) keeps its existing layout but adopts the same grid columns.

## Custom bids

- Bug fix (`BidControls`): when `lot.current_bid` changes and the typed amount is now below the new minimum, auto-bump the input to the new minimum; a still-valid higher typed amount is preserved. When the lot changes (new `lot.id`), reset to the new minimum. Implemented with the render-phase state-adjust pattern (repo lints `react-hooks/set-state-in-effect` as an error).
- Prominence: label the input `YOUR BID` (label-dash style), show `min {current+1} · max {maxBid}` as a steel hint, enlarge the field; quick-bid button stays as-is beside it.
- Server validation unchanged — this is client UX only. New visible text (`TEAMS`, `YOUR BID`, min/max hint) is allowed; existing test-sensitive copy (`Bid {n}`, blocked reasons, feed rows) must not change.

## Constraints

- No engine/RPC/hook-interface changes. `useDraftState`/`derive.ts` untouched.
- Gates: build clean, lint exit 0, vitest 15/15, `npm run e2e` green (e2e does not depend on team-column placement; verify).

## Out of scope

Mobile-specific redesign beyond the responsive grid, spectator left-rail content, bid presets (+5/+10), reordering feed/pool.
