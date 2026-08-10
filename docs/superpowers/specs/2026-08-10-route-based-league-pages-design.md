# Route-Based League Pages

**Date:** 2026-08-10  
**Status:** Approved design, pending implementation plan  
**Scope:** Split the landing-page sections into real routes so the homepage focuses on league identity and Twitch, Draft has a dedicated directory page, and Stats, Schedule, and Info are independently addressable future pages.

## Goals

- Make each primary navigation item a direct, bookmarkable URL.
- Keep `/` focused on Franchise Premier League identity and its Twitch destination.
- Move the existing draft directory out of the homepage into `/draft` without changing individual board behavior at `/draft/[id]`.
- Replace dead coming-soon navigation treatments with polished, standalone pages.
- Preserve the established FPL visual system and all existing draft/auth/data behavior.

## Route map

| Route | Purpose | Data |
| --- | --- | --- |
| `/` | League-and-Twitch broadcast homepage | Static only |
| `/draft` | Draft Central directory | Existing Supabase `drafts` query, unchanged |
| `/draft/[id]` | Existing live draft board | Unchanged |
| `/stats` | Future statistics destination | Static coming-soon content |
| `/schedule` | Future schedule destination | Static coming-soon content |
| `/info` | Future league information destination | Static coming-soon content |

## Navigation

- The shared header keeps the crest, FPL DRAFT wordmark, and existing auth control.
- Home links to `/`; Stats to `/stats`; Schedule to `/schedule`; Draft to `/draft`; Info to `/info`.
- Every primary item is a `next/link` link; no tab uses an in-page anchor or disabled control.
- The compact horizontal-scroll behavior on small screens stays in place.

## Homepage (`/`)

- Retain the current hero, Twitch feature, and broadcast styling.
- Remove the Explore grid’s destination cards and the Draft Central directory entirely.
- Keep the two Twitch links with the exact `https://www.twitch.tv/franchisepremierleague` destination, `target="_blank"`, and `rel="noreferrer"`.
- No Supabase query is made on the homepage. It becomes a fully static league/Twitch surface.

## Draft Central (`/draft`)

- Move the current Supabase query, admin link, empty state, and draft card list from `src/app/page.tsx` to `src/app/draft/page.tsx`.
- Preserve the query table, order, `Draft` cast, existing empty text (`No drafts yet.`), each `/draft/[id]` link, visible draft status, and `VIEW BOARD →` text.
- Use a simple standalone page layout: `DRAFT CENTRAL` micro-label, heading, concise supporting copy, and the existing cards below it.
- The existing dynamic board route at `/draft/[id]` remains a sibling and receives no behavior changes.

## Future pages

- Add `/stats`, `/schedule`, and `/info` as separate server-rendered routes.
- Each page uses the shared hash background and brand card system, with its own display heading, one-sentence purpose statement, and an honest `Coming Soon` status card.
- The pages have no made-up league results, fixture dates, rankings, or rules; they are purposefully informative placeholders until their data/features exist.
- Reuse a small shared presentational component for the common coming-soon shell, parameterized by title, eyebrow, and description. Do not introduce client state or a new styling system.

## Architecture

- `src/app/page.tsx` becomes static and composes only `LeagueHub` without children or Supabase imports.
- `LeagueHub` is simplified to only the hero and Twitch feature; it no longer owns Draft Central or the Explore grid.
- `src/app/draft/page.tsx` owns the existing draft-directory data flow.
- A focused shared component (for example, `src/components/home/ComingSoonPage.tsx`) owns the repeated static future-page presentation.
- `SiteNavigation` is updated to replace the anchor and noninteractive labels with the five real route links.

## Accessibility and responsive behavior

- All primary navigation items remain regular links with visible keyboard focus.
- Each page has one unique `h1`, and coming-soon status is readable as text rather than conveyed only by color.
- Mobile navigation continues scrolling horizontally rather than wrapping or hiding links.
- Preserve the existing reduced-motion override for smooth scrolling; the new routes do not require anchor scrolling.

## Testing and verification

- Update navigation tests to assert the five exact route destinations.
- Add focused tests for the static homepage: Twitch links remain safe; Draft Central and the future-card grid are absent.
- Add a focused Draft Central test by extracting the query-free presentational directory section if needed; continue exercising the existing query/links in the page integration where practical.
- Add a test for the reusable coming-soon component that verifies its supplied title, description, and status text.
- Run unit tests, lint, and the Webpack production build.
- Visually inspect `/`, `/draft`, `/stats`, `/schedule`, and `/info` at desktop and mobile widths with configured local Supabase values.

## Out of scope

- Implementing statistics, scheduling, league-information data, or related database structures.
- Changing live draft-board UI, logic, routes, permissions, or realtime behavior.
- Twitch embed/player and stream-status integration.
