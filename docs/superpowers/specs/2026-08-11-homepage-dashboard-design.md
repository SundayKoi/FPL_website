# Homepage Broadcast Dashboard Design

## Goal

Refocus the homepage around the FPL broadcast while adding compact, useful league context. The broadcast should be the dominant visual element, with current FPL S5 teams shown in a standings card and the existing player power-ranking content shown in a separate card.

## Layout

`LeagueHub` will render a responsive dashboard section with three sibling cards:

- **Broadcast:** the primary card, occupying approximately two-thirds of the available width on large screens.
- **Team Standings:** a compact card occupying approximately one-third of the width, stacked above the power-rankings card.
- **Power Rankings:** the existing weekly player standouts, redesigned as the second compact card in the right rail.

The current large introductory hero copy will be removed from the dashboard composition so the broadcast leads the page. The existing Twitch status, clip behavior, links, and empty state remain unchanged.

At smaller widths, the grid collapses to one column in the order broadcast, standings, power rankings. The layout must not rely on a fixed desktop-only breakpoint: card content should remain readable between common tablet and laptop widths as well as on phones.

## Data

The standings card will read teams from the configured `league_settings.featured_draft_id`, using the same Supabase source as the Teams page. Teams will be ordered by `nomination_position` and displayed with an initial `0–0` record. The data shape should leave a clear seam for later replacement of those zero values with actual match totals.

If no featured draft is configured or the configured draft cannot be loaded, the card will render a concise empty state rather than placeholder teams. The power-rankings card continues to use `fetchLatestWeeklyStandouts(5)` and links to `/stats`.

## Responsive behavior

- Use a fluid grid with a large-screen two-column ratio near `2fr 1fr`; do not encode fixed pixel widths for either card.
- The right rail should use a normal grid/flex stack with equal, content-driven card widths.
- Standings rows must tolerate long team names through truncation or wrapping without horizontal overflow.
- The power-score pill must not be required to fit beside the heading at narrow widths. It may wrap below the heading, shrink to content, or become a full-width/inline label based on available space.
- Headers use flexible alignment rather than forcing title, badge, and actions into one unbreakable row.
- The broadcast iframe remains aspect-ratio based and fills the card width at every breakpoint.
- Focus styles and link hit areas remain visible and usable on touch and keyboard layouts.

## Components

Add a focused standings presentation component rather than putting row markup directly in `LeagueHub`. Update `WeeklyStandouts` to support the compact card proportions and resilient header layout. Keep Supabase fetching in the server-side homepage composition or a small server data helper, following the existing server-client split.

## Error and empty states

- No featured draft: “Standings will appear once the FPL S5 teams are configured.”
- No weekly standout rows: retain the existing weekly-data empty message.
- Twitch unavailable/no clips: retain the existing broadcast fallback.

These states must preserve the card geometry and not introduce overflow or awkward blank columns.

## Verification

Add/update component tests for:

- rendering all configured teams as `0–0` standings;
- the no-featured-draft empty state;
- the power-score label remaining present in the compact card.

Run the existing unit/component test suite, lint, and a production build. Use the local browser/e2e setup or an equivalent rendered inspection at wide desktop, narrow laptop/tablet, and mobile widths to check the grid collapse, long-name behavior, badge wrapping, iframe aspect ratio, and keyboard focus visibility.
