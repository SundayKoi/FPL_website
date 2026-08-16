# Premier and Academy Page Split

## Goal

Make Premier and Academy first-class sections of the site. Premier retains the existing public routes and current Captain experience; Academy gets parallel pages backed by the `S1 Academy` draft, with a consistent top-of-page switch between the two versions.

## Route structure

Premier keeps the existing routes:

- `/`
- `/players`
- `/stats`
- `/schedule`
- `/teams`
- `/captain`

Academy adds parallel routes:

- `/academy`
- `/academy/players`
- `/academy/stats`
- `/academy/schedule`
- `/academy/teams`
- `/academy/captain`

The existing Premier routes remain canonical and do not gain a required query parameter. Existing `/teams?view=academy` behavior is replaced or redirected to `/academy/teams` so Academy has one stable URL family.

## Header navigation

The shared header contains two button-triggered dropdowns, `Premier` and `Academy`. Each dropdown contains Home, Players, Stats, Schedule, Teams, and Captain links for that section. The existing Info and Premium dropdowns remain available.

Dropdown triggers expose `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`. Existing keyboard, outside-click, route-change, mobile-menu, and focus behavior remains intact. The current page is marked with `aria-current` on the matching section link.

## Page toggle

Add a shared server-rendered `LeaguePageToggle` component to every paired page. It appears near the page heading, labels the two destinations as `Premier` and `Academy`, highlights the current section in gold, and links to the corresponding route. It must be present on Home, Players, Stats, Schedule, Teams, and Captain pages.

The toggle preserves relevant page state when that state is meaningful across sections, including stats tab, season, phase, and player query parameters. It does not preserve Premier-only team IDs or admin controls.

## Academy data

Resolve the Academy draft from `league_settings.academy_draft_id`, falling back to the draft named `S1 Academy`, using the same fallback behavior as the current Teams page. A missing Academy draft produces a branded empty/preview state and does not break Premier pages.

- Academy Teams loads teams, players, and profiles by the resolved Academy draft ID.
- Academy Players uses the provided Google Sheet as the Academy player source, including each player's display name and OP.GG link. The sheet is the source of truth for the Academy player directory; draft roster membership still comes from the `S1 Academy` draft. The page presents the data through the existing directory vocabulary, with Academy labeling and no assumption that the Premier canonical player pool is the source.
- Academy Home loads Academy teams/rosters and Academy-filtered standings and schedule data. Shared editorial content may remain shared when no draft-specific source exists.
- Academy Schedule filters existing fixtures by the normalized Academy team-name set and keeps the existing season/stage UI. Because `fixtures` has no draft ID, it must not show fixtures for teams outside that set.
- Academy Stats filters the existing aggregate/stat records by the normalized Academy team-name set wherever a team name is available. Player/champion/record/timeline data is restricted to games associated with those Academy teams. The existing stats UI and filters remain reusable.

## Captains

`/captain` remains the Premier Captain page and uses its current Premier team context and admin workflow.

`/academy/captain` is a separate Academy-only Captain page. It uses Academy teams and Academy draft rosters, restricts team selectors and captain visibility to Academy teams, and filters fixtures, reports, results, codes, and admin tools to the Academy team set. It reuses existing Captain components where their props support the filtered context, while avoiding cross-league team choices.

The Academy Captain page keeps the existing signed-in/captain/admin gate semantics. A user who is not an Academy captain sees the same branded gate rather than Premier teams or Premier captain data.

## Shared implementation boundaries

Create small shared helpers for:

- resolving Premier and Academy draft IDs and draft metadata;
- normalizing and matching team names across draft, fixture, and stats records;
- building paired Premier/Academy links while preserving safe query parameters;
- rendering the page-level toggle.

The Academy player source is the provided [Academy player spreadsheet](https://docs.google.com/spreadsheets/d/1GRCjWINa6k2JgW10L8Bs05tr1jkIAFfCFhb7wTh-GWc/edit?gid=1133886891#gid=1133886891). The implementation must isolate its column-to-player mapping so changes to the sheet layout do not spread through page components. If direct runtime access is unavailable, the source data should be imported into the existing player-pool/data boundary rather than duplicated in route components.

Refactor existing page data loaders only where needed to accept a league/draft context. Keep the current Premier behavior as the default and avoid duplicating large page components solely for route differences.

## Error and empty states

Database errors continue to follow each page's existing behavior. A missing Academy draft, Academy fixtures, or Academy stats renders an explicit empty state identifying Academy rather than silently displaying Premier data. Academy links remain visible in the header; the page toggle may show the Academy destination even when its data is unavailable.

## Verification

Add focused tests covering:

1. Header dropdown order, route destinations, accessible trigger state, and Academy links.
2. The shared toggle's active state and paired destinations on every page family.
3. Academy draft resolution and Academy-only team/player loading.
4. Academy schedule and stats filtering that excludes Premier team data.
5. Academy Captain access, team selectors, and admin filtering.
6. Existing Premier page behavior and `/teams` compatibility.

Run the focused Vitest tests, full `npm test`, `npm run lint`, and the relevant Playwright smoke tests before completion.
