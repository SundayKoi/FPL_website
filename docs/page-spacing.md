# Page width and spacing

Read [Frontend and design system](frontend.md) for theme and component sources.
The shared utilities and the newer feature shells coexist. A full-width
background does not imply that every content region is uncapped.

## Shared utilities

`src/app/globals.css` owns the base contract:

- `.page-container` has width 100%, no maximum width, and `min-width: 0`.
  It adds 16px side gutters below 640px, 24px from 640px, and 32px from
  1024px, plus the corresponding safe-area inset.
- `.page-spacing` adds 32px vertical padding, increasing to 40px from 640px.
  `.page-spacing-compact` stays at 24px.
- `.page-gap-compact`, `.page-gap-panel`, and `.page-gap-section` represent
  16px, 24px, and 32px gaps.

For a page without a feature shell, the base pattern is:

```tsx
<main className="page-backdrop flex-1">
  <div className="page-container page-spacing">{/* content */}</div>
</main>
```

A shell or layout owns the horizontal content gutter once. Child panels own
internal padding. Do not add the base pattern inside a shell that already
supplies those gutters. `data-page-container` is an inspection marker, not a
CSS utility; its actual width comes from the owner's styles.

## Current shell ownership

| Family | Owner and width behavior |
| --- | --- |
| Homepage | `src/components/home/HomeWorkspace.module.css` uses a centered container capped at 1600px with the shared gutter variable. |
| League views | `src/components/league/LeaguePageShell.tsx` and its CSS module own a centered 1440px container, header, section navigation, and content. Shared schedule, standings, teams, players, and stats views compose this shell. Detail routes can have their own modules. |
| Cards | `src/app/cards/layout.tsx` and `src/app/academy/cards/layout.tsx` apply `CardsPageShell.module.css`. Its direct-child `main` rule caps content at 1440px and supplies horizontal gutters; `.standalone` supplies equivalent bounds for standalone card surfaces. `CardsTabs` owns the navigation row. Inspect existing page markup before adding another container. |
| Play | `src/components/play/PlayPageShell.tsx` owns the themed surface and Play navigation. Individual features own their content layout. |
| Betting | `src/app/betting/layout.tsx` composes Play and supplies `max-w-6xl` content/header regions with `--page-gutter`. Children must not add a second outer gutter. |
| Admin | `src/app/admin/layout.tsx` and feature pages own the workspace/sidebar and content. Preserve their local form, table, and collectible bounds. |
| Other routes | My Team, draft, auth, information, share, and offseason pages use their route/feature wrapper. Check that wrapper rather than imposing a global maximum or removing an intentional one. |

Scoped module rules can override global utilities. The 1440px and 1600px
caps above are current design choices, not leftover violations of the old
full-width rollout. The module shells use `--page-gutter`; unlike the base
`.page-container`, this alone does not add safe-area insets.

Keep paragraphs readable (roughly 65–75ch), controls usable, dialogs bounded,
and collectible artwork at its intended ratio. Tables and spatial boards that
need extra width scroll within their own labeled region. Avoid fixing overflow
with body clipping, `100vw`, or negative viewport margins.

## Inventory and verification

The route source of truth is `src/app/**/page.tsx`, including redirect-only
routes. Enumerate it when planning a broad layout change:

```sh
rg --files src/app | rg '/page\.tsx$' | sort
```

The 2026-10-02 documentation audit found 142 page modules, including newer
admin workspace and offseason routes absent from the previous 124-route
inventory. Counts are a dated observation, not a completeness guarantee.

The earlier full-width rollout captured before/after images under
[`reports/page-spacing/before`](../reports/page-spacing/before) and
[`reports/page-spacing/after`](../reports/page-spacing/after). Its before set
used baseline `d8a3cf80`; its production-mode localhost server used placeholder
Supabase settings. Those images represent empty/unavailable data states and
predate later shell redesigns. They do not establish current browser coverage,
production deployment health, or authenticated-flow correctness.

For a new change, verify affected routes in both leagues at narrow and wide
widths, including menus, local table scrolling, access walls, and populated
states where relevant. Follow [testing](testing.md) for local fixture and
infrastructure commands, and report the states actually exercised.
