# Header Navigation Dropdowns Design

## Goal

Clean up the shared site header by removing the visible Home nav item, grouping Sign Up under Info, and introducing a Premium dropdown for premium destinations.

## Navigation structure

The FPL logo remains a link to `/`, but Home is removed from the primary navigation links. The remaining primary links stay unchanged:

- Stats
- Players
- Schedule
- Captain
- Draft
- Teams
- Info (dropdown)
- Premium (dropdown)

The Info dropdown contains `Sign Up` linking to `/signup`.

The Premium dropdown contains:

- `Betting` linking to `/betting`
- `Draft League` linking to `https://www.draftleague.lol/`, opening in a new tab with safe `noopener noreferrer` behavior

## Interaction and accessibility

Info and Premium are button-triggered dropdowns. Each trigger exposes `aria-haspopup="menu"` and its current state with `aria-expanded`. Dropdown links retain the existing visible focus styling. The menus close when a link is selected, Escape is pressed, the route changes, or the user clicks outside the navigation.

The dropdowns render inline with the expanded mobile menu and as positioned menus beneath their triggers on desktop. The existing hamburger menu continues to control the full mobile navigation and closes when a nav link is selected.

## Implementation boundary

The change is scoped to `src/components/SiteNavigation.tsx` and its tests. No new route is created for `/betting`; the navigation will point to that route as requested. Existing routes, logo behavior, auth slot behavior, styling vocabulary, and responsive breakpoints remain intact.

## Verification

Add tests covering:

1. Home is absent from the visible primary nav while the logo still links home.
2. Info and Premium triggers expose the expected dropdown links when opened.
3. The external Draft League link has the requested URL and safe new-tab attributes.
4. Dropdowns close after selecting a link and on Escape.
