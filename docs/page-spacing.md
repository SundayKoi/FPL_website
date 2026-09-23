# Page width and spacing

## Shared contract

- `.page-container` gives a full-width, `min-width: 0` surface a fixed gutter of 16px below 640px, 24px from 640px, and 32px from 1024px. Safe-area insets are added to the corresponding side.
- `.page-spacing` gives normal pages 32px vertical padding on mobile and 40px from 640px. `.page-spacing-compact` is for dense game and draft workspaces and stays at 24px.
- Gap tokens are 16px for compact controls, 24px for panel/grid gaps, and 32px for major sections.
- A page shell or its shared layout owns the page gutter once. Child panels own only their internal padding.
- Keep text near 65–75ch, controls usable, dialogs bounded, and collectible artwork at its intended ratio. Full-width describes page and section surfaces, not every control or image.
- Tables and spatial boards that need extra width scroll inside their own labeled region. Do not hide document overflow with `100vw`, negative viewport margins, or body clipping.

Use the shared classes for new and changed route shells:

```tsx
<main className="page-backdrop flex-1">
  <div className="page-container page-spacing">
    {/* page content */}
  </div>
</main>
```

Dense workspaces can use `page-spacing-compact`. Do not add another `page-container` to a descendant when a feature layout already owns the content gutter.

## Route and wrapper inventory

The inventory covers all 124 `src/app/**/page.tsx` route modules in the `develop` baseline. Route entries below are URL patterns; redirects are called out separately. Shared rendering and gutter owners are named so paired Premier and Academy routes do not drift.

| Layout family | Covered URL patterns | Rendering and gutter owner | Inner limits and required state |
| --- | --- | --- | --- |
| Home | `/`, `/academy` | `HomeDashboard` and `PreseasonHomePage`; each shared dashboard owns its page container | Headlines remain readable; empty/preview and regular-season data states use local league data.
| Directories | `/players`, `/players/:player`, `/academy/players`, `/teams`, `/academy/teams`, `/teams/:slug`, `/academy/teams/:slug` | `PlayersDirectory` and `TeamsDirectory` own gutters for both leagues; team detail routes own their shell | Player roles reflow as semantic columns; forms and roster controls keep usable widths. Empty preview data and normal local rosters cover both leagues.
| League views | `/standings`, `/academy/standings`, `/schedule`, `/academy/schedule`, `/stats`, `/academy/stats`, `/box-score`, `/academy/box-score`, `/match/:id` | `StandingsPageView` is shared; schedule and stats route modules own their shell | Tables remain full-width, with any required scroll inside the table region. Use local fixture data for dynamic matches.
| Premier Cards | `/cards`, `/cards/browse`, `/cards/claims`, `/cards/collection`, `/cards/compare`, `/cards/draw`, `/cards/expeditions`, `/cards/expeditions/ledger`, `/cards/fantasy`, `/cards/market`, `/cards/market/bounties`, `/cards/moments`, `/cards/packs`, `/cards/play`, `/cards/rarities`, `/cards/season-end`, `/cards/season-end/copy/:id`, `/cards/season-end/market`, `/cards/teams`, `/cards/trades`, `/cards/vault` | `src/app/cards/layout.tsx` owns tab gutters; route pages and shared views own their page shells | Preserve card ratio, shelves/container queries, artwork, readable copy, and bounded modals. Public, premium, empty, and token-backed states depend on local card fixtures.
| Academy Cards | `/academy/cards`, `/academy/cards/browse`, `/academy/cards/collection`, `/academy/cards/compare`, `/academy/cards/draw`, `/academy/cards/expeditions`, `/academy/cards/expeditions/ledger`, `/academy/cards/fantasy`, `/academy/cards/market`, `/academy/cards/market/bounties`, `/academy/cards/moments`, `/academy/cards/packs`, `/academy/cards/play`, `/academy/cards/rarities`, `/academy/cards/season-end`, `/academy/cards/season-end/copy/:id`, `/academy/cards/season-end/market`, `/academy/cards/teams`, `/academy/cards/trades`, `/academy/cards/vault` | `src/app/academy/cards/layout.tsx` plus the paired shared Premier view where used | Same art and control limits as Premier; verify the Academy theme and league-scoped local data.
| Share pages | `/card/:slug`, `/binder/:token` | Route modules own full-width page surfaces; card/binder content owns artwork size | Valid local slug/token fixtures show the normal surface; unavailable and invalid tokens retain a full-width background and centered message.
| Betting | `/betting`, `/betting/event/:id`, `/betting/market/:id`, `/betting/leaderboard`, `/betting/profile` | `src/app/betting/layout.tsx` owns the shared content gutter and feature navigation; child pages do not add another gutter | Event cards and metrics use intrinsic columns; compact controls stay bounded. Requires the existing local Premium/betting test bypass or an authorized local member fixture.
| Premium and daily games | `/premium`, `/bangers`, `/fpldle`, `/academy/fpldle`, `/higher-lower`, `/academy/higher-lower`, `/guess-the-card`, `/academy/guess-the-card` | Game and hub view owns the page shell; Bangers layout owns only its back-link row | Game-board geometry, card ratios, and artwork stay bounded; verify populated and unavailable states for both league themes.
| Draft workspaces | `/draft`, `/draft/:id`, `/drafter`, `/drafter/:token`, `/match-draft/:fixtureId` | Draft/game component owns its normal page shell; Drafter layout owns the back-link gutter | Dense workspace uses 24px vertical spacing. Keep spatial/broadcast/transparent overlay output geometry separate. Use the existing local draft fixture for interactive states.
| My Team and identity | `/my-team`, `/my-team/scouting`, `/academy/my-team`, `/academy/my-team/scouting`, `/identity-claims` | My Team/scouting view owns its route gutter; sparse access states keep a centered bounded card | Requires linked-player, captain, or admin local identity as applicable; preserve server authorization and verify signed-out/unavailable states separately.
| Information and support | `/info`, `/rulebook`, `/league-links`, `/glossary`, `/economy`, `/membership`, `/supporters`, `/support-devs` | Route/shared content owner uses the shared page container | Paragraph measures remain bounded; cards and related content use the available section width. Public pages use local/default data.
| Auth and signup | `/login`, `/signup`, `/sign/:token` | Route shell owns the full-width surface; sign-in/signature panel remains centered and bounded | Keep form controls and signing canvas usable. Tokenized signing needs a valid local token; do not alter auth or claim checks.
| Staff | `/admin`, `/admin/:draftId`, `/admin/analytics`, `/admin/announce`, `/admin/betting`, `/admin/betting/catalog`, `/admin/betting/pickems`, `/admin/betting/props`, `/admin/betting/seasons`, `/admin/betting/users`, `/admin/champions`, `/admin/claims`, `/admin/dribb`, `/admin/expeditions`, `/admin/mutations`, `/admin/on-air`, `/admin/overlays`, `/admin/parallels`, `/admin/patrons`, `/admin/seasons-end`, `/admin/seasons-end/crop-audit`, `/admin/sendoff` | Route page owns the shell; betting admin tabs own a separate aligned gutter; Seasons End uses compact fluid spacing | Requires local staff/admin fixture for protected content. Tables fill their region; form/dialog/artwork limits remain local.
| Other/legacy | `/broadcaster`, `/skin-lines`, `/captain`, `/captain/scouting`, `/academy/captain`, `/academy/captain/scouting`, `/admin/season-end` | Broadcaster/skin-lines route modules own the page shell; legacy captain and singular Season End paths are redirects | Broadcaster requires broadcaster/owner access. Verify redirects as redirects, not missing page implementations.

## Verification status

This inventory is the route checklist for implementation. The public browser matrix passed against the production server on Home, Players, Academy Teams, Premier Cards, and Academy Cards at 320, 375, 768, 1024, 1440, 1920, 2560, 3440, and 3840 CSS pixels. The test also opens the mobile navigation, Cards menu, and site search and checks that these states do not introduce document overflow.

Before and after production screenshots for those five routes are stored at [`reports/page-spacing/before`](../reports/page-spacing/before) and [`reports/page-spacing/after`](../reports/page-spacing/after), captured at 375, 1440, 2560, and 3440px with the webpack builder. The before set uses develop baseline `d8a3cf80`; both sets use localhost-only placeholder Supabase settings, so data-backed views show their empty or unavailable state. Representative comparisons: [Players, 3440px before](../reports/page-spacing/before/players-3440.png) / [after](../reports/page-spacing/after/players-3440.png), [Home, 375px before](../reports/page-spacing/before/home-375.png) / [after](../reports/page-spacing/after/home-375.png).

`npm run typecheck`, `npm run lint`, and `npm test` passed (419 files, 3587 tests). Lint reports one existing `<img>` warning in `src/components/captain/scouting/ChampionDatum.tsx`. The focused public E2E passed. `npx next build --webpack` completed successfully with localhost-only placeholder Supabase settings. The managed worktree uses a `node_modules` symlink outside its filesystem root, which Turbopack rejects; webpack was used for the production build and local E2E server.

The populated betting, draft, and admin E2E flows remain unverified because this machine has no local Supabase/Docker stack. The fixture guard refuses to seed unless `supabase status` reports a loopback URL and its key matches the app configuration. Protected screenshots and authenticated states must be captured when a local fixture stack is available; no cloud fixtures were written.
