# Frontend and design system

This reference describes the current source, not a proposed redesign. Read it
with [page spacing](page-spacing.md) when changing UI and
[backend boundaries](backend.md#request-and-data-boundaries) when changing data
flow. Dated plans and prototypes preserve intent but do not override the code.

## Source map

| Concern | Owning source |
| --- | --- |
| App shell, fonts, metadata, staff navigation flags | `src/app/layout.tsx` |
| Tailwind v4 theme, shared utilities, page spacing, card effects | `src/app/globals.css` and `postcss.config.mjs` |
| League theme selection | `src/components/LeagueThemeScope.tsx`, `src/lib/league/theme.ts` |
| Header and mobile navigation | `src/components/SiteNavigation.tsx`, `src/components/MobileTabBar.tsx` |
| Homepage workspace | `src/components/home/HomeWorkspace.module.css` |
| League pages, section navigation, toolbar, empty states | `src/components/league/LeaguePageShell.tsx` and its CSS module |
| Cards workspace | Both cards `layout.tsx` files, `src/components/cards/CardsPageShell.module.css`, `src/components/cards/CardsTabs.tsx` |
| Premium games and betting navigation | `src/components/play/PlayPageShell.tsx`, `src/components/play/BettingSectionNav.tsx` |
| Admin workspace | `src/app/admin/layout.tsx`, `src/lib/admin/navigation.ts` |
| Shared loading, error, connection, and toast UI | `src/components/system/` |

The app uses Tailwind utilities and feature CSS Modules. There is no single component-library theme to configure.
Reuse the owning feature shell before introducing another page wrapper.

## Tokens and themes

`globals.css` defines semantic roles in `@theme`: canvas, surface, raised,
border-subtle/strong, content, muted, action-fill/text, focus, success, danger,
and prestige. Prefer these meanings for shared controls. Compatibility aliases
such as navy, panel, line, steel, border, and primary still exist. Collectible
art and charts also use explicit feature colors; they are not a second set of
league access or status rules.

Global Premier identity defaults to purple/cyan; `[data-league="academy"]`
sets orange/pink. Redesigned home, league, cards, and play surfaces have scoped
CSS-module palettes, including the blue Premier accent. The global palette is
therefore not a complete description of a rendered page. Inspect the containing
shell before changing a token; a local palette must not accidentally restyle
another feature. Keep focus and text contrast usable in both leagues.

`LeagueThemeScope` sets `data-league` from the pathname. Premium and shared
match detail routes also honor `?league=academy` through `resolveThemeLeague`.
This controls appearance only; queries and server/database authorization must
still enforce league and season isolation.

The root layout loads Chakra Petch and Saira for the global display/body roles,
Anton for redesigned headings, and Cinzel, Bangers, and Pinyon Script for
special card treatments. The three decorative card fonts disable preloading.
Scoped shell rules override some `.type-display` headings to Anton. Do not
assume every heading uses the global display font or add another font loader
to a child component without checking the root variables.

## Navigation

The header has one direct My Team link and League, Cards, Play, and About
menus. `SiteNavigation` composes these sources:

- `src/lib/league/links.ts` and `src/lib/league/navigation.ts` for paired routes;
- `src/lib/cards/sections.ts` for card tabs, children, and card menu entries;
- `src/lib/play/destinations.ts` for Premium HQ, betting, and daily games;
- `src/lib/site/about.ts` for About destinations.

`LeagueBrandChooser` owns header league switching. `CardsTabs` has no second
league switcher. Premium HQ also exposes a league selector. Preserve the
mapping's special handling for opaque copy IDs and unpaired routes; replacing
`/academy` mechanically can send users to a nonexistent or wrong-league page.
Admin beside the avatar, Broadcaster under League, and Guess the Card's admin
test badge are presentation flags, not authorization.

## Rendering and state

Pages and layouts are Server Components by default. Keep session checks,
trusted reads, and secret-bearing modules on the server; pass the client only
the data its UI can reveal. Use Client Components for state, event handlers,
browser APIs, and realtime subscriptions. A client wrapper can receive rendered
server children without importing their server implementation.

Consult the installed Next.js guides under `node_modules/next/dist/docs/`
for the API being changed. This checkout uses async request APIs, including
`cookies()`, route `params`, and page `searchParams`. `npm run typecheck`
generates route types before TypeScript checking. `next.config.ts` does not
enable Cache Components or disable build type checking; do not assume either.

Use `RouteState` and `SectionLoading` for compatible loading/error states;
feature-specific loaders may preserve their own shell. Keep unavailable,
empty, permission-denied, and loading states distinct. `ToastProvider` lives
in the root layout; `ConnectionBanner` serves realtime connection status.

## Changing the UI

Keep one horizontal gutter owner per content region and honor the containing
shell's width: see [page spacing](page-spacing.md). Preserve card aspect ratios,
readable text measures, local table scrolling, visible keyboard focus, and
reduced-motion treatments. Check both league themes and the affected narrow
and wide layouts, including navigation and empty/access states.

Follow [testing](testing.md#choose-checks-by-change) for the checks appropriate
to the edit. Do not add tests that merely freeze CSS classes or copy; preserve
behavioral coverage for access, ownership, money, league isolation, and state
transitions. Prior screenshots and dated performance reports are historical
results, not evidence that the current UI was verified.
