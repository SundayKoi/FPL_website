# Broadcast Hub Landing Page

**Date:** 2026-08-10  
**Status:** Approved design, pending implementation plan  
**Scope:** Replace the root draft-list page with a clean Franchise Premier League broadcast hub. Preserve the current dark FPL Draft visual system and leave draft functionality intact.

## Goals

- Establish `/` as the public home for Franchise Premier League rather than an unstyled directory of drafts.
- Make the league's Twitch channel a prominent, direct destination: `https://www.twitch.tv/franchisepremierleague`.
- Give the future Stats, Schedule, Draft, and Info areas a clear shared navigation model without fabricating league data.
- Reuse the established visual language: deep navy background, subtle diagonal hash texture, blue panels, steel text, gold accents, Chakra Petch display type, Saira body/UI type.

## Page structure

### Shared site header

- Retain the crest, FPL DRAFT wordmark, and existing authentication control.
- Add compact navigation items: Home, Stats, Schedule, Draft, and Info.
- Home is active on `/`.
- Stats, Schedule, and Info are intentionally unavailable in this iteration; their nav treatment makes the forthcoming status clear and does not link to invented pages.
- Draft navigates to the Draft Central section on the home page, where all existing draft-board links remain available.

### Hero

- Full-width intro area over the existing hash-textured navy background.
- Eyebrow: `FRANCHISE PREMIER LEAGUE`.
- Large display heading that positions the league as a competitive League of Legends fantasy league.
- Short, editorial supporting copy focused on drafts, league action, and the community.
- Primary CTA opens the supplied Twitch channel in a new tab with safe external-link attributes.
- Secondary CTA scrolls to Draft Central.

### Twitch feature

- Prominent panel adjacent to the hero on large screens and directly below it on small screens.
- Use a broadcast-inspired placeholder treatment rather than embedding a live Twitch player: it avoids Twitch embed parent-domain configuration and works consistently in local and deployed environments.
- Include a live-style indicator, channel name, concise stream invitation, and a clear button that opens the Twitch channel.

### Explore grid

- Four clean, consistently sized destination cards: Stats, Schedule, Draft, and Info.
- Draft is the only active destination; it scrolls to Draft Central.
- Stats, Schedule, and Info show `Coming soon` badges and short honest descriptions. They are not presented as actionable pages and contain no placeholder standings, fixtures, or rules.
- Gold is reserved for selected/emphasized actions; panels otherwise stay navy, blue, and steel for visual restraint.

### Draft Central

- Keep the current Supabase-backed draft query and existing cards below the new hub content.
- Reframe the section with a `DRAFT CENTRAL` micro-label, a concise heading, and the existing admin link.
- Keep each draft's status and `VIEW BOARD` action unchanged so existing user flows and tests continue to work.
- Preserve the existing empty state if no drafts exist.

## Architecture

- `src/app/page.tsx` remains a Server Component and continues fetching drafts through `createServerSupabase`.
- The home page owns its static hero, Twitch feature, explore grid, and draft-directory presentation; no new database tables, RPC calls, or client state are required.
- Update `src/app/layout.tsx` only to add the shared navigation markup/styles while retaining the logo and `AuthButton` behavior.
- Extend `src/app/globals.css` only with reusable visual utilities needed by the landing page, avoiding a separate styling system.

## Interaction and accessibility

- In-page draft navigation uses semantic anchors and smooth scrolling, with a keyboard-visible focus state.
- External Twitch links use descriptive accessible text and open safely in a new tab.
- Coming-soon destinations use non-interactive text/badges instead of dead links.
- The layout remains readable and fully usable down to mobile widths: hero content and Twitch panel stack; the explore grid becomes a single column.

## Error handling

- The page continues to treat a failed or empty drafts response as an empty list and displays the existing no-drafts message.
- No live-stream API calls or Twitch embeds are introduced, so Twitch availability cannot block rendering the landing page.

## Verification

- Add/adjust a focused page test if the repository's existing test structure supports it; otherwise rely on rendering and type/build checks.
- Run `npm run lint`, `npm test`, and `npm run build`.
- Visually inspect the homepage at desktop and mobile widths, confirming the Twitch CTA destination, active draft links, coming-soon states, and current draft-list behavior.

## Out of scope

- New `/stats`, `/schedule`, or `/info` routes and their data models.
- Embedded Twitch player or stream-status integration.
- Changes to draft-board behavior, Supabase queries/RPCs, or auth behavior.
