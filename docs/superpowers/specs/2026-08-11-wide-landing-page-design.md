# Wide Landing Page Design

## Goal

Make the Franchise Premier League landing page use the same wide desktop rhythm as the Teams and Players directories, while preserving its current two-column hero content and responsive mobile behavior.

## Approved design

- The landing page keeps its existing two-column hero: editorial copy on the left and the live Twitch destination card on the right.
- The page shell changes from `max-w-7xl` to `max-w-[1800px]`, matching the Teams and Players directory shells.
- The shell uses the directory gutter pattern: `px-4 sm:px-6`.
- The hero grid gets more horizontal breathing room with a responsive gap of `gap-8 xl:gap-12`.
- Existing copy, links, card content, visual utilities, and mobile stacking remain unchanged.
- The landing page shell uses the directory vertical spacing pattern: `py-12 sm:py-16`, without changing the site header or global layout.

## Scope

Modify only `src/components/home/LeagueHub.tsx` and add the approved design specification. No data, routing, navigation, or component behavior changes are required.

## Verification

- The existing `LeagueHub` component test continues to verify the broadcast links and page focus.
- Run the focused homepage test, full unit suite, lint, production build, and `git diff --check` after implementation.
- Inspect the rendered landing page at mobile, desktop, and very wide desktop widths to confirm the two-column transition and wider shell behave as intended.
