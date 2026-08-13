# Info Pages Split Design

## Goal

Move the Rulebook and League Links content out of the combined Info page into separate first-class routes, while keeping the header dropdown easy to scan and preserving a useful `/info` destination for old links.

## Approved Design

- `/league-links` becomes the League Links page.
  - It shows the existing editable resource cards for league resources such as Payment and MasterDoc.
  - It excludes the Rulebook resource card because Rulebook now has its own route.
  - Admin users still see the existing resource editor so they can update linked resources from this page.
- `/rulebook` becomes the Rulebook page.
  - It shows the existing Rulebook header, source Google Doc link, section index, fixed back-to-sections link, and formatted rulebook content.
  - It uses the existing `rulebook` info resource URL for the source Google Doc, falling back to the current default if the database has no resource rows.
- `/info` becomes a lightweight hub.
  - It links users to `/league-links` and `/rulebook`.
  - It also keeps a Sign Up call-to-action so the Info dropdown destinations have a coherent landing page.
- Header Info dropdown links change from same-page anchors to separate pages:
  - Sign Up: `/signup`
  - League Links: `/league-links`
  - Rulebook: `/rulebook`

## Architecture

Extract the existing server-side info resource fetching into `src/lib/info/resources.ts` so `/league-links`, `/rulebook`, and `/info` can share fallback data and admin-status logic without duplicating Supabase calls. Keep the existing `InfoResourceCard`, `AdminInfoResources`, and `RulebookContent` components unchanged unless tests reveal a route-specific need.

## Testing

Use Vitest and Testing Library route tests:

- `SiteNavigation` verifies the Info dropdown points to `/league-links` and `/rulebook`.
- `/league-links` verifies Payment and MasterDoc render, Rulebook is excluded, the League resources region exists, and admin editor remains available for admins.
- `/rulebook` verifies the Rulebook heading, source Google Doc link, section index, and back-to-sections link render on the standalone page.
- `/info` verifies the hub links to the two new pages and Sign Up.

## Scope Notes

- Do not change the editable info resource schema.
- Do not create redirects unless a test or Next.js route behavior requires it.
- Preserve unrelated untracked files in the working tree.
