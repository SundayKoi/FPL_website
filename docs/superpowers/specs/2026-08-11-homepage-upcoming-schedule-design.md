# Homepage Upcoming Schedule Design

## Goal

Add a full-width upcoming-schedule card below the homepage dashboard. It should show the active regular-season week and link directly to the matching week on the Schedule page.

## Progression

The homepage advances strictly through `week_1` → `week_2` → `week_3` → `week_4` → `week_5`.

- Start at Week 1.
- A week remains active until every fixture row in that week has both scores recorded.
- Once a week is complete, advance to the next week in order.
- Never skip a week because a later week has data.
- If the active week has no fixture rows, show a compact “Schedule coming soon” state while still linking to that week on `/schedule`.
- After Week 5 is complete, show a concise regular-season-complete state rather than selecting gauntlet/playoff stages.

## Data and linking

The homepage queries public `fixtures`, resolves the newest available season using the existing schedule helpers, and selects the active regular-season stage using the completion rule above. It passes those fixtures to a focused presentational component that reuses `FixtureCard` for consistent matchup/date formatting.

The Schedule page will add stable section IDs for each stage, including `week_1` through `week_5`. The homepage link targets `/schedule?season=<season>#week_<n>` when a non-default season is active, and `/schedule#week_<n>` for the default season.

## Responsive behavior

The card spans the homepage content width below the dashboard. Its header wraps naturally, fixture rows retain the existing responsive `FixtureCard` behavior, and the Schedule link remains a touch-friendly visible target at mobile widths.

## Verification

Add tests for strict progression: incomplete Week 1 selects Week 1, completed Week 1 selects Week 2, and completed Week 1 plus missing Week 2 rows still selects Week 2. Add component tests for fixture rendering, empty state, complete state, and the Schedule link. Preserve existing Schedule and homepage tests, then run the clean test suite, targeted lint, and production build.
