# Homepage Schedule Placement Design

## Goal

Place the upcoming schedule directly beneath the broadcast/clips card, while restoring team standings to the right rail above weekly standouts.

## Layout

The homepage remains a responsive two-column dashboard. The left column is a vertical stack containing, in order:

1. `TwitchShowcase` (live broadcast or offline clips)
2. `UpcomingSchedule`

The right column is a vertical stack containing, in order:

1. `HomeStandings`
2. `WeeklyStandouts`

On smaller screens, the document order becomes broadcast, schedule, standings, then weekly standouts.

## Components and data flow

`LeagueHub` continues fetching Twitch data, weekly standouts, standings, and schedule in parallel. The existing components and props remain unchanged. Only their parent stacks and placement within the dashboard change.

## Testing

Update the homepage layout regression test to assert that broadcast and schedule share the left stack, standings and weekly standouts share the right stack, and the four cards appear in the specified document order. Existing component and data tests remain applicable.

## Scope and non-goals

- Do not change schedule, standings, Twitch, or weekly-stat data fetching.
- Do not redesign the individual cards.
- Do not add breakpoints, fixed heights, or unrelated visual changes.
