# Homepage Standings Placement Design

## Goal

Remove the awkward tall right-rail standings presentation by placing team standings directly beneath the broadcast/clips card. Keep weekly standouts in the right column.

## Layout

The homepage dashboard remains a responsive two-column grid on larger screens. The left grid item becomes a vertical stack containing, in order:

1. `TwitchShowcase` (live broadcast or offline clips)
2. `HomeStandings` (team standings)

The right grid item remains `WeeklyStandouts`. At smaller widths, the grid collapses naturally to broadcast, standings, then weekly standouts.

The existing card components, spacing tokens, standings data source, empty state, and visual styling remain unchanged. Only the composition in `LeagueHub` changes, avoiding a fixed-height or stretch-based layout.

## Components and data flow

`LeagueHub` continues to fetch Twitch status/clips, weekly standouts, standings, and schedule in parallel. It passes the same data to the same presentational components. The refactor changes only the parent structure so standings are siblings with the broadcast in the left stack rather than siblings with weekly standouts in the right stack.

## Testing

Update `LeagueHub.test.tsx` to verify the dashboard still uses the responsive two-column layout and that the broadcast, standings, and weekly standouts are present. Add a structural assertion that the standings article is in the same left stack as the broadcast and appears before the weekly standouts article in document order. Existing component and data tests remain applicable.

## Scope and non-goals

- Do not change standings calculations, ordering, or data fetching.
- Do not redesign the individual cards.
- Do not change the upcoming schedule placement.
- Do not add new responsive breakpoints or fixed heights.
