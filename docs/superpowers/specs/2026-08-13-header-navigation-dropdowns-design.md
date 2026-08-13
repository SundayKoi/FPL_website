# Header Navigation Dropdowns Design

## Goal

Clean up the shared site header by removing the visible Home nav item, grouping Sign Up under Info, and introducing a Premium dropdown for premium destinations.

## Navigation structure

The FPL logo remains a link to `/`, but Home is removed from the primary navigation links. The remaining primary links stay unchanged, followed by Premium and then Info:

- Stats
- Players
- Schedule
- Captain
- Draft
- Teams
- Premium (dropdown)
- Info (dropdown)

The Info dropdown contains:

- `Sign Up` linking to `/signup`
- `League Links` linking to `/info#league-resources`
- `Rulebook` linking to `/info#rulebook-heading`

The Premium dropdown contains:

- `Betting` linking to `/betting`
- `Draft League` linking to `https://www.draftleague.lol/`, opening in a new tab with safe `noopener noreferrer` behavior

## Interaction and accessibility

Info and Premium are button-triggered dropdowns. Each trigger exposes `aria-haspopup="menu"` and its current state with `aria-expanded`. Dropdown links retain the existing visible focus styling. The menus close when a link is selected, Escape is pressed, the route changes, or the user clicks outside the navigation.

The dropdowns render inline with the expanded mobile menu and as positioned menus beneath their triggers on desktop. The existing hamburger menu continues to control the full mobile navigation and closes when a nav link is selected.

The Info page exposes the `league-resources` anchor on its existing League resources section so the new dropdown link lands on that section.

## Implementation boundary

The change is scoped to `src/components/SiteNavigation.tsx`, `src/components/SiteNavigation.test.tsx`, and the existing League resources section in `src/app/info/page.tsx`. No new route is created for `/betting` or either Info destination. Existing routes, logo behavior, auth slot behavior, styling vocabulary, and responsive breakpoints remain intact.

## Verification

Add tests covering:

1. Home is absent from the visible primary nav while the logo still links home.
2. Info and Premium triggers expose the expected dropdown links when opened.
3. Info appears to the right of Premium in the primary navigation order.
4. League Links and Rulebook have the requested fragment URLs.
5. The external Draft League link has the requested URL and safe new-tab attributes.
6. Dropdowns close after selecting a link and on Escape.
