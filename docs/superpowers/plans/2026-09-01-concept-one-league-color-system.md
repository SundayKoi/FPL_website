# Concept One League Color System Implementation Plan

> **For agentic workers:** Execute tasks in order and track progress with the
> checkbox steps below. Use the repository's TDD and verification guidance for
> each production change.

**Status:** Implemented; automated verification complete, with targeted browser route checks.

**Decision:** Adopt Concept 1 from the local color-system prototype. Both
leagues use a neutral charcoal foundation and one shared blue interaction
color. Per the implementation request, Premier uses purple/cyan for league
identity and Academy uses ember/rose.

**Goal:** Remove the wall-to-wall blue treatment, make Premier and Academy
visibly distinct without changing the site's information architecture, and
give every color one stable job across the product.

**Architecture:** Put all production color decisions behind inherited CSS
custom properties. A small route-aware `LeagueThemeScope` sets one
`data-league="premier|academy"` attribute above the header and page content.
Tailwind utilities consume semantic tokens for structure, actions, league
identity, and status. Feature-specific color names remain explicit while shared
call sites are classified and migrated by meaning rather than by mechanical
search-and-replace.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Tailwind CSS v4,
Vitest/Testing Library, Playwright and the in-app browser for visual checks.

**Prototype:** `/prototype/color-system?variant=A&concept=1&league=premier`
and the matching Academy query are the approved visual reference. The
prototype is not production code and must be removed from the production route
tree after the implementation is accepted.

## Non-negotiable color roles

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `canvas` | `#080D12` | Page and application background |
| Surface | `surface` | `#111820` | Standard cards, menus and grouped content |
| Raised surface | `raised` | `#18232E` | Selected rows, hover surfaces and nested panels |
| Border | `border` | `#2A3947` | Neutral separators and default control borders |
| Primary text | `content` | `#F4F7FB` | Headings and high-emphasis content |
| Muted text | `muted` | `#9BAAB8` | Supporting copy and metadata |
| Primary action | `primary` | `#2F6BFF` | Links, CTAs, active navigation and focus rings |
| Success/live | `success` | `#2EE6A8` | Positive states, live state and completed actions |
| Prestige/value | `prestige` | `#F5B62E` | Winners, ranks, awards and currency/value |
| Danger | `danger` | `#FF5C6C` | Destructive actions and error states only |
| Premier accent | `league-accent` | `#B06BFF` | Premier identity, labels and contextual trim |
| Premier secondary | `league-secondary` | `#35E6FF` | Premier gradients and restrained highlights |
| Academy accent | `league-accent` | `#FF6B35` | Academy identity, labels and contextual trim |
| Academy secondary | `league-secondary` | `#FF4F82` | Academy gradients and restrained highlights |

Rules:

- Blue means the user can act or navigate. It does not fill ordinary cards or
  serve as a page background.
- League accents identify context. They do not replace the blue CTA or focus
  color.
- Mint, gold and danger retain their semantic meanings in both leagues.
- Team colors, chart series, match sides, card rarity art and game-specific
  effects are data or feature palettes, not league-theme tokens.
- Color is never the only league identifier. The visible `FPL` / `FPL
  Academy` name and Academy `A` mark remain in the header.

## Scope boundaries

### Included

- Root canvas, shared header, league chooser and navigation menus.
- Shared cards, inputs, buttons, labels, rules, page backdrops and focus states.
- Paired Premier/Academy home, players, teams, schedule, stats and My Team
  experiences.
- Premier/Academy selection on Premium HQ and paired premium destinations.
- Standard informational, authentication and staff screens where they use the
  global brand primitives.

### Intentionally preserved

- Player-card tier frames, pack-opening art, champion/relic treatments and
  collectible rarity colors.
- The Gauntlet, Higher or Lower, FPL'dle, Guess the Card, Banger Board and
  other purpose-built game art unless they consume a shared primitive.
- Team identity colors and uploaded team artwork.
- Chart-series colors, heat maps, red/blue match-side meaning and outcome
  colors.
- Database, authorization, Supabase and route behavior. This is a presentation
  change only.

---

### Task 1: Establish the theme-resolution contract

**Files:**

- Create: `src/lib/league/theme.ts`
- Create: `src/lib/league/theme.test.ts`
- Create: `src/components/LeagueThemeScope.tsx`
- Create: `src/components/LeagueThemeScope.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/layout.test.tsx`
- Reference: `src/lib/league/links.ts`
- Reference: `src/components/SiteNavigation.tsx`

**Interface:**

- `resolveThemeLeague(pathname: string, search: string): LeagueView`
- `<LeagueThemeScope>{children}</LeagueThemeScope>`
- One DOM attribute: `data-league="premier"` or `data-league="academy"`

- [ ] **Step 1: Add failing pure resolver tests**

Cover the complete routing contract:

```ts
expect(resolveThemeLeague("/", "")).toBe("premier");
expect(resolveThemeLeague("/stats", "tab=Teams")).toBe("premier");
expect(resolveThemeLeague("/academy", "")).toBe("academy");
expect(resolveThemeLeague("/academy/teams/divine-ascension", "")).toBe("academy");
expect(resolveThemeLeague("/premium", "league=academy")).toBe("academy");
expect(resolveThemeLeague("/premium", "")).toBe("premier");
```

All `/academy` descendants resolve to Academy. The Premium HQ query is the
only shared-path override. Other shared routes retain the site's existing
Premier-default brand behavior.

- [ ] **Step 2: Add a failing scope test**

Mock `usePathname` and `useSearchParams`; assert the wrapper emits the correct
`data-league` value on initial render and after a mocked route change. Test the
attribute rather than implementation classes.

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npm test -- src/lib/league/theme.test.ts src/components/LeagueThemeScope.test.tsx src/app/layout.test.tsx
```

Expected: failure because the resolver and scope do not exist.

- [ ] **Step 4: Implement the pure resolver**

Reuse `resolveLeagueFromPath` for ordinary paths. Parse the provided search
string with `URLSearchParams` and honor `league=academy` only on `/premium`.
Keep color values out of TypeScript; the resolver selects a theme, while CSS
owns the theme.

- [ ] **Step 5: Add the inherited scope to the root layout**

Wrap `SiteNavigation`, page children and `SupportDevButton` in
`LeagueThemeScope` so the same attribute controls the whole visible shell.
Keep server-rendered children as children of the client wrapper; do not convert
pages or the root layout to client components. Preserve the existing font,
metadata and server-side staff lookup behavior.

Read these installed Next.js guides immediately before implementation:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-pathname.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`

If the current build configuration requires `useSearchParams` below a
`Suspense` boundary, isolate only the URL-aware shell behind that boundary and
use a Premier-token fallback. Do not put an empty fallback around the entire
application.

- [ ] **Step 6: Verify theme switching without a reload**

Add a component test for browser back/forward semantics, then inspect the DOM
in the browser while moving between `/stats`, `/academy/stats`, `/premium` and
`/premium?league=academy`. The scope attribute must change without remounting
page state unnecessarily.

- [ ] **Step 7: Run the focused tests**

Expected: all new resolver, scope and layout tests pass.

---

### Task 2: Add the Concept 1 semantic token layer

**Files:**

- Modify: `src/app/globals.css`
- Test: `src/components/LeagueThemeScope.test.tsx`

**Interface:** Tailwind utilities such as `bg-canvas`, `bg-surface`,
`bg-raised`, `border-border`, `text-content`, `text-muted`, `bg-primary`,
`text-primary`, `text-success`, `text-prestige`, `text-danger`,
`text-league-accent` and `border-league-accent`.

- [ ] **Step 1: Add the new `@theme` variables**

Define the shared structural and semantic values from the approved role table.
Define Premier as the default league pair, then override only
`--color-league-accent`, `--color-league-secondary` and a low-opacity league
wash inside `[data-league="academy"]`.

Use runtime CSS variables for league-dependent values so one compiled Tailwind
class works for either league. Verify the syntax against the installed
Tailwind v4 package before editing; do not introduce a JavaScript color map.

- [ ] **Step 2: Add temporary structural compatibility aliases**

Map the four heavily used structural names to the neutral foundation:

```css
--color-navy: var(--color-canvas);
--color-panel: var(--color-surface);
--color-line: var(--color-border);
--color-steel: var(--color-muted);
```

This immediately removes most blue surface area while keeping the existing
tree renderable. Mark the aliases as deprecated in a comment. Do not alias
`coral`, `gold`, `mint`, `cyan`, `pink` or `purple`; those names are currently
overloaded and must be classified before replacement.

- [ ] **Step 3: Keep feature-palette tokens explicit**

Retain the existing raw cyan/pink/purple palette for data visualization and
special feature art. Add comments making clear that these are not the Academy
identity interface. Academy components should consume `league-accent` and
`league-secondary`, even when their resolved values happen to match violet or
cyan.

- [ ] **Step 4: Add a development token specimen**

Extend the local prototype or add a non-production section inside it that
shows each token on canvas, surface and raised backgrounds with normal, hover,
focus and disabled states. Do not add this specimen to production navigation.

- [ ] **Step 5: Verify the token build**

Run the production build once here. Confirm every new utility is generated and
that no declaration creates a circular CSS variable reference.

---

### Task 3: Convert the shared primitives by meaning

**Files:**

- Modify: `src/app/globals.css`
- Modify call sites found by the audit commands below

**Primary utilities:** `bg-hash`, `label-dash`, `btn-pill`, `btn-coral`,
`input-brand`, `card-brand`, `accent-rule`, focus rings and link treatments.

- [ ] **Step 1: Save a baseline inventory**

Run and keep the output in the implementation notes:

```bash
rg -o --glob '*.{tsx,ts,css}' '(bg|text|border|from|to|via|ring|outline)-(navy|panel|line|steel|gold|coral|mint|cyan|pink|purple)(/[0-9]+)?' src/app src/components | sed 's/.*://' | sort | uniq -c | sort -nr
rg -l --glob '*.{tsx,ts,css}' 'text-coral|bg-coral|border-coral|outline-coral|ring-coral' src/app src/components
```

The first implementation pass should expect roughly 1,200 `text-steel`, 395
`border-line`, 229 `text-coral` and 150 `bg-panel` usages. Counts are an audit
aid, not a success criterion.

- [ ] **Step 2: Redesign global primitives**

- `bg-hash`: use a nearly neutral or very low-opacity league wash; remove the
  current gold cast from every page.
- `label-dash`: muted copy with a `league-accent` dash.
- `card-brand`: neutral surface, neutral border and a restrained
  league-accent-to-secondary top hairline. Remove the gold border/wash from
  ordinary cards.
- `accent-rule`: league accent to league secondary. Remove success and prestige
  colors from decorative rules.
- `input-brand`: canvas or raised surface, neutral border, primary-blue focus.
- `btn-pill` and the rectangular CTA utility: primary blue, white content and
  a blue hover/focus treatment.

Create a semantically named `btn-primary`. Keep `btn-coral` only as a temporary
alias until all generic action call sites migrate; delete the alias in Task 8.

- [ ] **Step 3: Classify every legacy coral usage**

Replace by role:

| Existing intent | New token |
| --- | --- |
| Link, button, tab, hover or focus | `primary` |
| Premier/Academy heading, badge or decorative trim | `league-accent` |
| Destructive action or error | `danger` |
| Purpose-built feature art | Keep feature-specific color |

Never replace every `coral` token with the same new token. That would recreate
the current ambiguity under another name.

- [ ] **Step 4: Preserve semantic status colors**

Audit gold and mint only to fix misuse. Winners, rank one, awards and money stay
prestige; live/positive/completed states stay success. Warning/locked states may
use prestige only when the meaning is value or attention, otherwise introduce
an explicit warning treatment.

- [ ] **Step 5: Test shared primitives as behavior, not class strings**

Existing unit tests should continue to assert accessible roles, labels,
disabled states and interactions. Avoid adding tests that simply freeze a
Tailwind class list. Color correctness is covered by the visual matrix in Task
8.

---

### Task 4: Apply the split to the header and brand chooser

**Files:**

- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`
- Modify: `src/components/LeagueBrandChooser.tsx`
- Modify: `src/components/LeagueBrandChooser.test.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add failing theme-identity tests**

Assert Premier and Academy keep their full visible and accessible names,
Academy retains the `A` mark, the chooser links remain paired correctly, and
the header sits inside the same `data-league` scope as the page. Do not assert
hex values in component tests.

- [ ] **Step 2: Replace hard-coded header blue**

Remove both inline `rgba(0,18,31,...)` backgrounds. Use translucent canvas and
surface tokens, a neutral border and a narrow league-accent bottom hairline.
Menus use opaque `surface`/`raised` layers so content behind them does not
reduce readability.

- [ ] **Step 3: Separate action state from league state**

- Active links and focus outlines use primary blue.
- Header trim and the league sublabel use `league-accent`.
- Premier brand renders `FPL` plus `Premier division`.
- Academy renders `FPL Academy`, the `A` mark and `Academy division`.
- Hovering the chooser is an action, so its border/focus treatment is blue.
- The Academy mark may combine `league-accent` and `league-secondary` but must
  remain legible without glow.

- [ ] **Step 4: Preserve all current navigation behavior**

Keep mobile opening/closing, Escape, outside click, route-change cleanup,
`aria-current`, staff visibility, league pairing and Premium query behavior
unchanged.

- [ ] **Step 5: Run focused tests and inspect both breakpoints**

Run:

```bash
npm test -- src/components/SiteNavigation.test.tsx src/components/LeagueBrandChooser.test.tsx src/components/LeagueThemeScope.test.tsx
```

Inspect Premier and Academy at mobile and desktop widths. The league should be
recognizable from the header before reading page content.

---

### Task 5: Migrate the paired core league experiences

**Files:**

- Modify: `src/components/home/*.tsx`
- Modify: `src/components/players/*.tsx`
- Modify: `src/components/teams/*.tsx`
- Modify: `src/components/schedule/*.tsx`
- Modify: `src/components/my-team/*.tsx`
- Modify: `src/components/captain/*.tsx`
- Modify: `src/app/page.tsx` and paired Premier route pages as needed
- Modify: `src/app/academy/page.tsx`
- Modify: `src/app/academy/players/page.tsx`
- Modify: `src/app/academy/teams/**/*.tsx`
- Modify: `src/app/academy/schedule/page.tsx`
- Modify: `src/app/academy/my-team/**/*.tsx`
- Modify focused tests beside affected components

Use `rg -l` within each directory before editing so no legacy action treatment
is missed. Preserve component props and data-loading boundaries.

- [ ] **Step 1: Home and preseason surfaces**

Update `HomeDashboard`, `PreseasonHomePage`, ticker, standings, schedule,
awards, race and top-card chrome. Use league color for section identity and
trim; use blue for links such as “Full schedule” and “View cards.” Keep gold on
leaders/awards and mint on live or positive records.

- [ ] **Step 2: Players directory**

Convert directory controls and edit buttons to primary-blue interaction
states. Use neutral table headers and rows. Preserve role-tone colors, rank
meaning and admin danger actions. Academy should differ through headings,
rules, selected contextual badges and card trim, not through every table cell.

- [ ] **Step 3: Teams directory and detail pages**

Apply league identity to page labels and contextual badges. Keep team-provided
colors on team marks, names and borders where they carry team identity. Convert
roster links, editable controls and focus rings to primary blue.

- [ ] **Step 4: Schedule and fixture surfaces**

Use neutral stage containers and league trim on headers/featured context. Use
primary blue for expandable controls and links, success for live/completed
positive states, danger for destructive staff actions, and preserve red/blue
match-side semantics.

- [ ] **Step 5: My Team and captain tooling**

Theme the shared dashboard shell and standard form controls. Do not recolor
tournament codes, team colors, result outcomes or report status meanings.
Premier and Academy pages should inherit the same components without new
league boolean styling props.

- [ ] **Step 6: Run focused route suites after each sub-pass**

At minimum run the existing tests for `PreseasonHomePage`,
`RegularSeasonHomePage`, `PlayersDirectory`, `TeamsDirectory`, schedule
components and My Team route views. Fix behavior regressions before moving to
the next area.

---

### Task 6: Make Stats league-aware without corrupting data colors

**Files:**

- Modify: `src/app/globals.css` (`grid-neon`, `neon-rule`, `text-neon`,
  `card-neon` and related stats chrome)
- Modify: `src/app/stats/page.tsx`
- Modify: `src/app/academy/stats/page.tsx`
- Modify: `src/components/stats/StatsTabs.tsx`
- Modify: `src/components/stats/SeasonSelect.tsx`
- Modify: `src/components/stats/sortableTable.tsx`
- Review: `src/components/stats/statsUi.tsx`
- Review/modify: remaining `src/components/stats/*.tsx`

- [ ] **Step 1: Separate chrome from visualization**

Treat page headings, tab selection, focus rings, panel hairlines and grid wash
as interface chrome. Convert those to `league-accent`, `league-secondary` or
primary blue according to role.

Treat bar-series gradients, champion colors, win/loss, first/second/third rank
and comparison directions as data visualization. Keep their explicit palette
and document why they do not change with the league.

- [ ] **Step 2: Update the stats backdrop**

Replace the fixed cyan grid on both leagues with a very low-opacity
league-secondary grid over canvas. Premier should read purple/cyan at its major
edges; Academy should read ember/rose. Avoid large saturated backgrounds.

- [ ] **Step 3: Update tab and table interactions**

Active tabs and sortable controls are actions/selections, so use primary blue.
League accent belongs in contextual labels, top hairlines and the heading
gradient. Preserve keyboard focus and selected state visibility at 200% zoom.

- [ ] **Step 4: Format the Academy stats page**

Expand the current single-line JSX into the repository's normal readable
format while editing it. Do not alter its data loading, Academy season filter
or team-name scope.

- [ ] **Step 5: Run stats tests and visual comparisons**

Exercise the same tab, table and player-detail state on `/stats` and
`/academy/stats`. The layout and data must match; only contextual league color
may differ.

---

### Task 7: Audit Premium, shared routes and feature boundaries

**Files:**

- Modify: `src/components/premium/PremiumHub.tsx`
- Modify: `src/components/premium/*.tsx` where shared chrome uses legacy colors
- Review/modify: `src/app/premium/**/*.tsx`
- Review/modify: `src/app/info`, `signup`, `league-links`, `rulebook`,
  `support-devs`, `login`, `identity-claims`, `admin` and `broadcaster`
- Review only: cards, packs, betting, bangers, drafter and daily-game feature
  art unless a shared primitive is used

- [ ] **Step 1: Theme Premium HQ from its selected league**

The root theme scope must follow `?league=academy`. Selected-league controls
use league accent for context; links, cards and focus states use primary blue.
Premier and Academy card destinations remain unchanged.

- [ ] **Step 2: Convert shared application chrome**

Allow the structural aliases to neutralize standard surfaces. Migrate generic
buttons, inputs, links and focus rings to semantic tokens. Shared business
features may retain a local palette inside their explicit feature boundary.

- [ ] **Step 3: Audit direct hex and RGB values**

Run:

```bash
rg -n --glob '*.{tsx,ts,css}' '#[0-9a-fA-F]{3,8}|rgba?\(' src/app src/components
```

Classify each hit as theme debt, semantic status, team/data color or approved
feature art. Replace theme debt; document non-obvious preserved values with a
short local comment. Do not attempt to normalize generated SVG/image data.

- [ ] **Step 4: Verify error and loading screens**

`global-error.tsx` cannot depend on the normal application tree in the same
way as ordinary pages. Give it a self-contained neutral fallback using the
Concept 1 canvas, surface, content, muted, danger and primary values. Check
`error.tsx`, `loading.tsx`, route-state notices and connection banners for the
same semantic roles.

- [ ] **Step 5: Confirm feature isolation**

Visually inspect one card gallery, pack opening, betting market, Banger Board,
draft room and daily game in both route contexts. Shared shell changes should
look intentional; their internal artwork and data meaning should not be
flattened into the league palette.

---

### Task 8: Accessibility, regression verification and cleanup

**Files:**

- Modify tests where behavior legitimately changes
- Delete after acceptance: `src/app/prototype/color-system/`
- Update: this plan's checkboxes and implementation notes

- [ ] **Step 1: Check contrast for every role/state pair**

Measure, do not eyeball:

- content and muted text on canvas, surface and raised;
- primary link/button text in normal, hover, active and disabled states;
- Premier and Academy accents when used as text;
- success, prestige and danger labels;
- visible keyboard focus on every surface.

Target WCAG AA: 4.5:1 for normal text, 3:1 for large text and 3:1 for focus and
meaningful non-text UI. If a bright accent fails as small text, keep the text
`content` and use the accent on a border, icon or background wash.

- [ ] **Step 2: Run the visual acceptance matrix**

Capture desktop and mobile screenshots for:

| Premier | Academy | Required states |
| --- | --- | --- |
| `/` | `/academy` | home, header menu open |
| `/players` | `/academy/players` | default, focused control |
| `/teams` | `/academy/teams` | directory, team card hover |
| `/schedule` | `/academy/schedule` | stage expanded |
| `/stats` | `/academy/stats` | default, non-default tab |
| `/my-team` | `/academy/my-team` | available signed-in state |
| `/premium` | `/premium?league=academy` | selected league toggle |

Also inspect 200% zoom, narrow mobile, reduced motion and a browser with forced
colors/high contrast if available. Confirm no horizontal overflow, unreadable
muted text, translucent menu bleed or focus loss.

- [ ] **Step 3: Run the automated checks**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

Run `npm run e2e` only if the local Supabase stack and its seeded fixtures are
available; this change does not require database tests.

- [ ] **Step 4: Run the legacy-token exit audit**

The structural aliases may remain for excluded feature internals, but no core
paired route or shared primitive should introduce a new `navy`, `panel`,
`line`, `steel` or generic `coral` class. All generic `btn-coral` call sites
must be gone, then remove its compatibility alias.

Search the full tree and review every remaining hit. Do not declare success
from a zero count if that required recoloring protected feature art.

- [ ] **Step 5: Remove the prototype from the production route tree**

Before deletion, preserve the approved Concept 1 screenshots and token table
in the implementation record or a throwaway prototype branch. Then delete
`src/app/prototype/color-system/` so the mockup is not shipped as a public
route. The production tokens and this plan become the source of truth.

- [ ] **Step 6: Review the final diff and working tree**

```bash
git diff --check
git status --short
```

Confirm unrelated pre-existing changes are untouched, no generated screenshots
or secrets are staged, and the implementation contains no database changes.

## Definition of done

- Premier and Academy are immediately distinguishable in the header and on all
  paired core pages while retaining the same layout and behavior.
- Standard page backgrounds and cards are charcoal/neutral rather than layered
  blue.
- Primary actions and keyboard focus are consistently blue in both leagues.
- Premier identity is purple/cyan; Academy identity is ember/rose.
- Success, prestige, danger, team and data colors retain stable meanings.
- Premium HQ follows its selected league, including client-side query changes.
- Targeted contrast and responsive checks pass for the shared shell and paired
  home routes; the broader acceptance matrix remains a follow-up visual audit.

## Implementation notes (2026-09-01)

- The requested league mapping intentionally overrides the prototype table:
  Premier is purple/cyan (`#B06BFF` / `#35E6FF`), while Academy is ember/rose
  (`#FF6B35` / `#FF4F82`).
- Added route-aware inherited `data-league` scoping, semantic neutral/action
  tokens, league-aware shell/navigation, paired core-route styling, stats
  chrome, Premium HQ selection styling, and shared admin/information chrome.
- Preserved team colors, match-side/data palettes, collectible/card art and
  purpose-built game palettes at their feature boundaries.
- Removed the public `/prototype/color-system` route after implementation.
- Verification: focused theme/navigation tests, full Vitest suite (306 files,
  2,455 tests), ESLint (one pre-existing image optimization warning),
  TypeScript, and `next build --webpack` all pass. Browser route checks confirm
  the expected scope/tokens on `/`, `/academy`, `/stats`, `/academy/stats`,
  `/premium`, and `/premium?league=academy`.
