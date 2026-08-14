# Draft Desktop Rail Layout Design

## Goal

Make the desktop draft board wider and easier to monitor at a glance by placing all teams in a left rail and moving draft chat into a Twitch-style sticky right rail. Preserve the existing stacked experience on tablet and mobile.

## Approved approach

Use a three-column responsive grid owned by `DraftBoard`:

- Left rail: all `TeamColumn` cards, with existing nominator and current-team highlighting.
- Center column: `CenterStage`, `BidFeed`, bid and nomination controls, captain/admin controls, and `PlayerPool`.
- Right rail: the existing `DraftChat` component, sticky on desktop with an internally scrolling message list.

The board shell will use a wider maximum width. Desktop rail widths will be bounded (approximately 260–290px for teams and 300–340px for chat), while the center column remains flexible. The setup, loading, not-found, and completed-draft states stay full-width and retain their current behavior.

## Responsive behavior

The three-column grid activates at the existing large-screen breakpoint. Below that breakpoint, the layout returns to a stacked flow ordered as:

1. Auction stage and live controls.
2. Chat.
3. Player pool.
4. Team cards.

This keeps the current mobile/tablet viewing pattern while allowing the desktop layout to prioritize persistent team visibility.

## Component changes

`DraftBoard` remains the only layout/data orchestration point. Its draft state, actions, subscriptions, and error handling are unchanged. The current-team-only desktop sidebar is replaced by a left-rail teams section containing every team.

`DraftChat` gains an optional styling hook for the desktop rail. The component remains mounted exactly once. At desktop sizes, its outer panel fills a viewport-relative sticky height and its message list expands to consume available space and scrolls independently. On smaller screens it keeps its existing compact height behavior.

No database, route, or API changes are needed.

## Verification

- Update or add focused draft board assertions for the team/chat layout structure without coupling tests to browser pixel dimensions.
- Run the relevant draft component tests.
- Run lint.
- Run a production build to catch Next.js/TypeScript issues.
- Manually inspect desktop and narrow viewport rendering if a local browser is available, specifically checking sticky chat scrolling, team card readability, and mobile ordering.

## Out of scope

- Redesigning individual team cards, chat message styling, or auction controls.
- Changing draft state, permissions, realtime subscriptions, or chat behavior.
- Adding a chat collapse button or alternate rail modes.
