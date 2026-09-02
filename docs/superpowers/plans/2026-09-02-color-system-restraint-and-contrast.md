# Color System Restraint and Contrast Implementation Guide

> **For agentic workers:** Execute tasks in order. Keep each checkbox current.
> This guide refines the implemented Concept One color system; it does not
> reopen league-theme routing or replace feature-art palettes.

**Status:** Ready for implementation.

**Parent plan:**
`docs/superpowers/plans/2026-09-01-concept-one-league-color-system.md`

**Goal:** Make the new neutral, league-aware palette feel cleaner and more
intentional by removing repeated diagonal texture, reducing decorative color
area, strengthening interaction contrast, and reserving league color for
meaningful identity moments.

**Visual direction:** Clean broadcast desk rather than cyberpunk wallpaper.
Most pixels are charcoal neutrals. League color identifies context. Blue
identifies interaction. Green, red and gold identify outcomes or value. The
italic display type supplies directional energy, so the page background stays
quiet.

**Architecture:** Keep color decisions behind CSS custom properties in
`src/app/globals.css`. Split the overloaded primary token by foreground and
fill use, split neutral borders by subtle and interactive use, replace the
global hash utility with a non-repeating page backdrop, and separate neutral
cards from deliberately league-accented cards. Migrate call sites by meaning,
not by global string substitution.

**Tech stack:** Tailwind CSS v4 theme variables and custom utilities, Next.js
16.3 App Router, React 19, TypeScript, Vitest/Testing Library, Playwright, and
browser-based visual inspection.

## Outcome at a glance

| Concern | Current state | Target state |
| --- | --- | --- |
| Page backdrop | Repeating 135-degree league-colored lines | Plain charcoal with one faint, non-repeating league wash near the top |
| Standard cards | Every `card-brand` receives league hairline and wash | Standard cards are neutral; featured/context cards opt into accent |
| Primary blue | One token used as text, border, focus ring and solid fill | Separate action foreground, solid fill and focus roles |
| Borders | One subtle token used for cards and controls | Subtle structural border plus strong interactive border |
| Stats texture | Dense 46px grid at 10% color mix | Stats-only 64px grid at 5–6% color mix |
| Saturated color | Several accents can compete within one container | One decorative accent family per container; status exceptions stay small |
| Homepage top rhythm | Pattern emphasizes the empty band above ticker | Quiet backdrop plus a smaller top gap if visual review still finds it loose |

## Non-negotiable color roles

The implemented league identity remains valid:

- Premier identity: purple `#B06BFF` plus cyan `#35E6FF`.
- Academy identity: ember `#FF6B35` plus rose `#FF4F82`.
- Canvas, surface, raised, content and muted values stay unchanged.
- Blue remains interaction color in both leagues.
- Success, danger and prestige keep their current semantic meanings.
- Team identity, chart series, match sides, player-card tiers, collectible art,
  game effects and purpose-built feature palettes stay explicit.

Refine shared tokens to this interface:

| Role | Token | Value | Required use |
| --- | --- | --- | --- |
| Canvas | `canvas` | `#080D12` | Root page background |
| Surface | `surface` | `#111820` | Standard grouped content |
| Raised | `raised` | `#18232E` | Hover, selected and nested surfaces |
| Subtle border | `border-subtle` | `#2A3947` | Decorative card edges and separators |
| Strong border | `border-strong` | `#526678` | Inputs, inactive controls and essential boundaries |
| Content | `content` | `#F4F7FB` | High-emphasis text |
| Muted | `muted` | `#9BAAB8` | Supporting text |
| Action fill | `action-fill` | `#294FCA` | Solid primary buttons and selected pills |
| Action text | `action-text` | `#6F93FF` | Links, active labels and outline controls |
| Focus | `focus` | `#6F93FF` | Keyboard focus outlines and rings |

The proposed values produce these approximate WCAG contrast ratios:

- `content` on `canvas`: 18.15:1.
- `muted` on `surface`: 7.52:1.
- white on `action-fill`: greater than 6:1.
- `action-text` on `canvas`: greater than 6:1.
- `border-strong` on `surface`: approximately 3:1; contrast against `canvas`
  is higher.

Use contrast tests to verify computed production styles; the table is the
design decision, not a substitute for verification.

## Color budget

Use this as a review rule, not as a literal pixel-counting requirement:

- Roughly 80% neutral canvas/surfaces/content.
- Roughly 15% league identity in labels, hairlines and restrained washes.
- Roughly 5% action or semantic color.

Within one ordinary card:

- Use at most one decorative accent family.
- Status colors may coexist only when they encode data, such as wins and
  losses in standings.
- Keep status color on compact marks, badges or one value; supporting copy
  remains content or muted.
- Gold appears for rank, winner, award, money or collectible prestige. It is
  not a generic warm accent.
- League accents do not indicate clickability.
- Action blue does not decorate passive content.

## Scope

### Included

- Shared theme tokens and utilities in `src/app/globals.css`.
- Every generic route wrapper currently using `bg-hash`.
- Shared cards, inputs, buttons, links, tabs, focus indicators and borders.
- Premier and Academy home, directory, schedule, stats, My Team, Premium and
  standard staff surfaces.
- A small computed-style Playwright contract for the shared color interface.
- Desktop and mobile visual verification for Premier and Academy.

### Preserved

- League resolution and `data-league` behavior from the parent plan.
- Database, authorization, data loading and route behavior.
- Team colors and uploaded art.
- Chart-series, red/blue side, role-tone and heat-map colors.
- Player-card frames, foils, pack art and collectible rarity treatments.
- Purpose-built game art unless it consumes a shared utility being replaced.
- Banger Board's jungle canvas; remove diagonal hash there without replacing
  the green feature background.

## Global constraints

- Read `AGENTS.md`, `README.md` and the parent plan before implementation.
- Read the relevant guides under `node_modules/next/dist/docs/` before changing
  any Next.js page, layout or component behavior. CSS-only edits do not require
  an unrelated framework rewrite.
- Verify Tailwind v4 custom-property and utility behavior against the installed
  package before changing token syntax.
- Preserve unrelated working-tree changes. Stage only files belonging to this
  refinement.
- Keep content, accessible names, DOM semantics, route behavior and data logic
  unchanged unless a step explicitly says otherwise.
- Migrate color classes by semantic role. A blind replacement of every
  `primary`, `border` or `bg-hash` occurrence is prohibited because feature and
  interaction meanings differ.
- Test behavior through public interfaces. Do not add component tests that
  merely freeze full Tailwind class strings.
- Use screenshots as review evidence, not as the only verification gate.

---

## Task 1: Capture the visual and token baseline

**Files:**

- Read: `src/app/globals.css`
- Read: shared components under `src/components/`
- Optionally create temporary screenshots outside the repository

**Purpose:** Establish one reproducible before-state and complete usage
inventory before changing shared utilities.

- [ ] **Step 1: Confirm the current branch and preserve local changes**

Run:

```bash
git status --short
git diff -- src/app/globals.css src/components src/app
```

Record which files already contain user changes. Work around them rather than
discarding or reformatting them.

- [ ] **Step 2: Inventory the shared utility surface**

Run:

```bash
rg -n --glob '*.{css,tsx,ts}' 'bg-hash|grid-neon|card-brand|card-neon' src/app src/components
rg -n --glob '*.{css,tsx,ts}' '(bg|text|border|outline|ring)-primary(/[0-9]+)?' src/app src/components
rg -n --glob '*.{css,tsx,ts}' 'border-border|border-line|input-brand|btn-primary|btn-pill' src/app src/components
```

Classify results into generic shared chrome, status/data color, league identity
or protected feature art. Keep this classification as implementation notes.

- [ ] **Step 3: Capture the before matrix**

At desktop and mobile widths, capture the first viewport for:

| League | Route | What it exercises |
| --- | --- | --- |
| Premier | `/` | Hash backdrop, homepage cards, ticker and header |
| Academy | `/academy` | Warm league override on the same structure |
| Premier | `/stats` | Grid backdrop, active navigation and filters |
| Academy | `/academy/stats` | Academy grid and stats chrome |
| Premier | `/schedule` | Standard cards, links and controls |
| Academy | `/academy/schedule` | Paired standard route |
| Premier | `/login` | Form controls, CTA and focus treatment |
| Academy | `/premium?league=academy` | Shared-path league scope and card grid |

Use seeded/local data where available. A loading state is not sufficient for
homepage or schedule review; wait for stable content.

- [ ] **Step 4: Measure current computed styles**

From the rendered application, record computed values for canvas, surface,
content, muted, primary, league accent, league secondary and default border.
Measure these pairs with a WCAG relative-luminance function:

- Content on canvas and surface.
- Muted on canvas and surface.
- Primary link text on canvas.
- White on a solid primary button.
- Default control border against its adjacent background.

**Task completion criterion:** The route screenshot matrix exists outside the
repository, every shared utility usage has a semantic classification, and the
five contrast pairs have recorded baseline ratios.

---

## Task 2: Split interaction and border tokens

**Files:**

- Modify: `src/app/globals.css`
- Modify: shared action and form call sites found by Task 1
- Create: `e2e/color-system.spec.ts`

**Interfaces:**

- `bg-action-fill`
- `text-action-text`
- `border-action-text`
- `outline-focus` / `ring-focus`
- `border-border-subtle`
- `border-border-strong`

- [ ] **Step 1: Add the refined semantic tokens**

Add the token values from the role table to `@theme`. Keep temporary aliases
only while migration is in progress:

```css
--color-border-subtle: #2a3947;
--color-border-strong: #526678;
--color-action-fill: #294fca;
--color-action-text: #6f93ff;
--color-focus: #6f93ff;

--color-border: var(--color-border-subtle);
--color-primary: #2f6bff;
```

Mark `border` and `primary` as compatibility tokens in the same comment block
as the existing neutral aliases. Do not point `primary` at either new action
token: foreground and solid-fill uses need different contrast behavior.

- [ ] **Step 2: Update shared utilities first**

Apply these meanings:

| Existing use | Replacement |
| --- | --- |
| Solid primary button | `action-fill` with white text |
| Link or active text | `action-text` |
| Outline-action border | `action-text` |
| Focus outline/ring | `focus` |
| Passive card separator | `border-subtle` |
| Input/control boundary | `border-strong` |

Update `btn-pill`, `btn-primary` and `input-brand` before individual component
classes. Hovering a solid action may brighten the fill slightly, but its text
contrast must remain at least 4.5:1. Focus must remain visible independently of
hover.

- [ ] **Step 3: Migrate component call sites by role**

Run separate inventories for `bg-primary`, `text-primary`, `border-primary`,
`outline-primary` and `ring-primary`. Work in small directory groups:

1. Header and league chooser.
2. Home, players, teams and schedule.
3. Stats and My Team/captain tools.
4. Premium and standard card-management surfaces.
5. Admin and broadcaster controls.

For classes that combine states, preserve state meaning:

```text
inactive: border-border-strong text-muted
hover:    border-action-text text-action-text
active:   bg-action-fill text-white
focus:    outline-focus
```

Feature-specific `primary` usage may remain temporarily only when the
classification notes explain why it is not shared interaction chrome. The
final cleanup in Task 7 resolves every remainder.

- [ ] **Step 4: Add computed contrast coverage**

Create `e2e/color-system.spec.ts` without adding a new dependency. Implement a
small relative-luminance/contrast helper inside the spec and check rendered
computed colors on a public route:

- Action text against canvas is at least 4.5:1.
- White button text against action fill is at least 4.5:1.
- Muted text against surface is at least 4.5:1.
- Strong input border against its adjacent outer surface is at least 3:1.
- Premier and Academy resolve different league-accent values.
- Both leagues resolve the same action-fill and action-text values.

Select elements by accessible role or stable test identifier. Do not select by
Tailwind class when checking the user-facing controls.

- [ ] **Step 5: Run focused verification**

Run the existing tests for any modified interaction modules, then:

```bash
npx playwright test e2e/color-system.spec.ts
```

**Task completion criterion:** Shared action text, fill, focus and control
boundaries use their new roles; all six computed-style assertions pass; no
modified control loses hover, disabled or keyboard-focus behavior.

---

## Task 3: Replace the repeated hash with a quiet page backdrop

**Files:**

- Modify: `src/app/globals.css`
- Modify: every generic `bg-hash` call site under `src/app` and
  `src/components`

**Interface:** `page-backdrop`

- [ ] **Step 1: Add a non-repeating backdrop utility**

Add a new utility with a canvas base and one shallow league-colored wash:

```css
@utility page-backdrop {
  background-color: var(--color-canvas);
  background-image: radial-gradient(
    ellipse 80% 32rem at 50% -10rem,
    color-mix(in srgb, var(--color-league-accent) 8%, transparent),
    transparent 72%
  );
  background-repeat: no-repeat;
}
```

The exact ellipse may be tuned during Task 6, but these invariants are fixed:

- No repeating gradient.
- No diagonal line texture.
- Wash originates above the page rather than behind every card.
- League color remains visible only as atmosphere.
- Canvas is the fallback when `color-mix()` or the image layer is absent.

- [ ] **Step 2: Migrate generic wrappers**

Replace `bg-hash` with `page-backdrop` on ordinary page and loading wrappers.
Do not change layout classes, max widths, minimum heights or data boundaries in
this pass.

- [ ] **Step 3: Handle feature canvases explicitly**

- On Banger Board, remove `bg-hash` and keep `bg-jungle`; do not put the league
  radial wash over the green feature canvas.
- On other purpose-built game canvases, use `page-backdrop` only when the page
  already uses the shared league shell. Preserve card/foil/game effects.
- Keep `grid-neon` on stats and player-profile surfaces; it is refined in Task
  5 rather than replaced here.

- [ ] **Step 4: Delete the misleading utility**

After migration:

```bash
rg -n --glob '*.{css,tsx,ts}' 'bg-hash' src
```

Expected: zero results. Delete `@utility bg-hash` from `globals.css`. Do not
retain an alias whose name describes a texture that no longer exists.

- [ ] **Step 5: Verify both league washes**

Inspect Premier and Academy home, schedule, login/gate and loading states.
The background should read as charcoal first. League context should remain
noticeable near the top without visible bands, hard ellipse edges or a colored
fog behind the whole document.

**Task completion criterion:** Production source contains no `bg-hash` or
repeating diagonal page texture; generic routes use `page-backdrop`; protected
feature canvases retain their own backgrounds.

---

## Task 4: Separate neutral cards from featured cards

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/components/home/*.tsx`
- Modify: selected shared route components found in Task 1

**Interfaces:**

- `card-brand`: neutral standard container
- `card-featured`: opt-in league identity treatment

- [ ] **Step 1: Make `card-brand` neutral**

Keep its surface, subtle border, radius and shadow. Remove its league hairline
and full-panel wash:

```css
@utility card-brand {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
```

- [ ] **Step 2: Add the opt-in identity treatment**

Move the current top hairline and shallow league wash into `card-featured`.
Keep the accent line at one pixel and lower the wash if it competes with text.
`card-featured` must be safe to compose with `card-brand`.

- [ ] **Step 3: Apply accent only where it earns meaning**

Recommended homepage allocation:

- `FeaturedMatchup`: `card-brand card-featured`.
- `HomeStandings`: neutral `card-brand`; rank/status colors provide meaning.
- `AwardsDesk`: neutral base; prestige treatment stays inside award content.
- `StandingsRace`: neutral base; action and rank colors stay local.
- `TopCards`: neutral base; tier art/value provides its own color.
- `UpcomingSchedule`: neutral base unless it is explicitly marked featured.

Outside the homepage, opt into `card-featured` only for a route's primary hero,
live context or league-identity summary. Ordinary forms, tables, modals and
nested cards remain neutral.

- [ ] **Step 4: Keep selected state interactive**

A selected tab, filter or row uses action fill/text or raised neutral surface,
not `card-featured`. League identity describes where the user is; action state
describes what the user selected.

- [ ] **Step 5: Review nested surfaces**

Where a surface sits inside another surface, prefer raised/canvas contrast and
subtle borders over a second shadow or another league wash. Avoid stacked glow
edges.

**Task completion criterion:** Standard cards are visually neutral; every use
of `card-featured` can be explained as hero, live or league-context emphasis;
no container uses league accent merely because it is a card.

---

## Task 5: Reduce specialized background and status intensity

**Files:**

- Modify: `src/app/globals.css`
- Modify only the stats/status call sites identified during review

- [ ] **Step 1: Relax the stats grid**

Update `grid-neon` from 46px spacing and 10% league-secondary mix to 64px
spacing and 5–6% mix. Keep horizontal and vertical lines one pixel. The grid
must remain stats-specific.

- [ ] **Step 2: Preserve stats hierarchy**

- Keep one league-colored heading or active rule at a time.
- Keep inactive tabs muted.
- Use action text/fill for active navigation and interactive filters.
- Keep chart series explicit and unchanged.
- Keep `card-neon` only where the stats presentation intentionally needs the
  top data accent; do not migrate standard cards into it.

- [ ] **Step 3: Reduce color by area before changing hue**

For success, danger, prestige, cyan, pink and purple:

- Keep core token values during this pass.
- Reduce colored backgrounds to restrained alpha washes.
- Keep colored text to the compact label/value carrying the meaning.
- Return surrounding copy, row labels and metadata to content/muted.
- Preserve icons, labels or ordering so color is not the only signal.

Examples:

- Standings form may keep green/red dots; team names remain content.
- Rank one may keep a gold number; the full row does not need gold text.
- An error keeps danger icon/label and readable copy; the whole panel does not
  need a saturated red border plus red background plus red body text.
- A live badge may use success; nearby timestamps and descriptions stay muted.

- [ ] **Step 4: Review rivalry and game CTAs separately**

`btn-rivalry` is purposeful feature art, not a standard CTA. Preserve it where
the component is explicitly rivalry/game presentation. Generic submit, save,
next and navigation actions use `action-fill` or `action-text`.

**Task completion criterion:** Stats grid is visibly quieter, generic chrome
does not inherit stats neon, and semantic colors remain clear without filling
large passive areas.

---

## Task 6: Tune spacing and atmosphere from rendered pages

**Files:**

- Potentially modify: `src/components/home/HomeDashboard.tsx`
- Potentially modify: route wrappers whose top spacing is visually excessive
- Potentially modify: `src/app/globals.css`

This is a visual decision step. Do not preemptively compress every page.

- [ ] **Step 1: Re-capture the Task 1 route matrix**

Use the same routes, viewport sizes, content states and scroll positions. Place
before and after images side by side.

- [ ] **Step 2: Evaluate the homepage top gap**

The prior diagonal pattern made the space between sticky header and ticker
look like an empty striped banner. With the quiet backdrop applied, judge the
space again.

If it still reads loose, change only the homepage outer padding from:

```text
py-12 sm:py-16
```

to:

```text
py-8 sm:py-10
```

Keep section spacing and grid gaps unchanged in that commit. This isolates the
top-rhythm decision from card-density changes.

- [ ] **Step 3: Tune the radial wash once**

Compare these states:

- Premier desktop and mobile.
- Academy desktop and mobile.
- Short login/gate page.
- Long homepage/schedule page.

Adjust only ellipse size, origin or alpha. Stop when all four conditions hold:

- Canvas is dominant.
- Header-to-content transition is not a hard band.
- Academy does not become brown/orange across entire panels.
- Premier does not return to wall-to-wall blue/purple.

- [ ] **Step 4: Check typography against the clean backdrop**

Italic display headings should now provide the page's direction. Do not add a
replacement texture, skewed card edges or more gradients to compensate for the
removed lines.

**Task completion criterion:** Before/after matrix shows cleaner hierarchy at
both breakpoints; any spacing change is limited to a route where the rendered
gap remained excessive; radial wash has no visible edge or full-page cast.

---

## Task 7: Remove compatibility tokens and finish the semantic audit

**Files:**

- Modify: `src/app/globals.css`
- Modify: remaining call sites reported by audit commands
- Update: parent color-system plan status notes only if necessary

- [ ] **Step 1: Audit remaining compatibility uses**

Run:

```bash
rg -n --glob '*.{css,tsx,ts}' '(bg|text|border|outline|ring)-primary(/[0-9]+)?' src/app src/components
rg -n --glob '*.{css,tsx,ts}' 'border-border([^a-z-]|$)' src/app src/components
rg -n --glob '*.{css,tsx,ts}' 'bg-hash' src
```

Classify every remaining `primary` and generic `border` use. Convert shared
interaction chrome. Preserve only protected feature usage with a feature token
whose name states its meaning.

- [ ] **Step 2: Remove deprecated shared aliases when unused**

Delete `--color-primary` after all production classes use action roles. Delete
the generic `--color-border` alias after passive and interactive boundaries use
the correct split. Keep the older `navy`, `panel`, `line` and `steel` aliases
only if protected feature internals still require them under the parent plan's
scope boundary.

- [ ] **Step 3: Run a semantic color search**

Inspect remaining coral, cyan, pink, purple, gold, mint and red classes in
shared directories. Each use must fit one of:

- League identity through inherited league tokens.
- Status/value meaning.
- Data visualization.
- Team/role/match-side identity.
- Protected feature art.

Replace ambiguous generic interaction uses with action roles. Do not replace
valid feature palettes for the sake of a zero count.

- [ ] **Step 4: Check diff locality**

Review the diff for unrelated formatting or behavioral edits. Restore locality
by separating any legitimate non-color behavior into another change.

**Task completion criterion:** No production `bg-hash`; no generic shared
interaction relies on `primary`; passive and interactive borders use explicit
roles; all remaining saturated feature colors have an explainable meaning.

---

## Task 8: Full verification and acceptance

**Files:** No new production scope.

- [ ] **Step 1: Run narrow tests throughout implementation**

Run tests beside every changed interactive component. At minimum include theme
scope, header, league chooser and any control modules whose active/disabled
classes changed.

- [ ] **Step 2: Run repository checks**

Run the commands documented in `README.md` that are relevant to presentation
work:

```bash
npm run lint
npm test
npm run build
npx playwright test e2e/color-system.spec.ts
```

If the local environment cannot run a command, record the exact blocker and
run the broadest safe substitute. Do not call a visual inspection a build
check.

- [ ] **Step 3: Run the final visual matrix**

Verify:

- Premier and Academy desktop.
- Premier and Academy mobile.
- Home, stats, schedule, login and Premium HQ.
- Loading, empty, disabled, hover and keyboard-focus states.
- At least one long page after scrolling below the radial wash.

- [ ] **Step 4: Check color-role acceptance criteria**

Every item must pass:

- Page backgrounds contain no repeated diagonal lines.
- Canvas reads neutral on both leagues.
- League identity remains obvious from header plus restrained contextual trim.
- Ordinary cards are neutral.
- Featured cards are exceptional rather than universal.
- Blue links and buttons are visibly interactive and meet contrast targets.
- Inputs have visible boundaries and focus rings.
- Gold means prestige/value, green means positive/live, red means
  danger/negative.
- Stats keeps a quieter, stats-only grid.
- Feature art, team identity and chart colors remain intact.
- No route behavior, accessible name or interaction changed unintentionally.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git diff --stat
git diff -- src/app/globals.css src/app src/components e2e/color-system.spec.ts
```

Confirm the diff contains only color-system refinement, focused spacing where
visually justified, tests and documentation.

**Guide completion criterion:** All automated checks pass, final computed
contrast assertions pass, visual matrix meets every acceptance criterion, and
the diff contains no unrelated behavior or protected-feature recoloring.

## Recommended commit boundaries

Keep commits independently reviewable:

1. `refactor: split shared interaction color roles`
2. `style: replace diagonal page texture with quiet backdrop`
3. `style: reserve league accents for featured surfaces`
4. `style: reduce stats and status color intensity`
5. `test: verify shared color contrast contracts`

If a commit cannot render or pass its focused checks independently, combine it
with the minimum prerequisite commit rather than landing a broken intermediate
state.

## Rollback strategy

The work is CSS and class migration. Roll back by commit boundary:

- Token split can revert independently if all action call sites revert with it.
- Backdrop migration can revert independently because it has one utility
  interface.
- Card accent allocation can revert independently because `card-featured` is
  opt-in.
- Stats tuning can revert independently because `grid-neon` is scoped.

Never roll back by restoring the whole working tree; unrelated user changes may
be present.
