# Esports Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire app to the FPL Exchange brand (fplexchange.com) — deep-navy esports look with Chakra Petch/Saira type, crest logo, gold money accents — changing zero logic and zero user-visible copy.

**Architecture:** Define the brand once as Tailwind v4 `@theme` tokens + a few CSS utilities in `globals.css`, load fonts via `next/font/google` CSS variables in `layout.tsx`, then sweep components/pages to the tokens. Styling-only: class attributes and non-semantic wrapper markup may change; props, hooks, logic, routes, and copy may not.

**Tech Stack:** Tailwind CSS v4 (CSS-first `@theme`), next/font, existing Next.js 16 app.

**Spec:** `docs/superpowers/specs/2026-08-08-esports-reskin-design.md` — read it first; its palette/typography/detail values are canonical.

## Global Constraints

- **Zero changes to:** component logic, hooks, props/interfaces, routes, RPC calls, user-visible copy. Tests key on copy: `Bid {n}`, `Nominate (opens at {n})`, `Waiting for`, login placeholders `email`/`password`, button text `Sign in`, BidFeed's `{team} bid {n} on {player}`.
- Palette (exact): bg `#001F34`, panel `#0A2A47`, header `rgba(0,18,31,0.9)`, border `#1B4263`, muted text `#A7C0D8`, gold `#F5B62E`, danger `#EF4444`, success emerald-500.
- Fonts: Chakra Petch (weights 600, 700, italic) display; Saira (400, 500, 600) body. Via `next/font/google` only — no runtime font fetches, no `<link>` tags.
- Dark-only: `color-scheme: dark`; no theme toggle.
- Every task ends with: `npm run build` clean, `npm run lint` exit 0, `npm test` 15/15. Task 5 additionally runs `npm run e2e` green.
- The ONLY allowed attribute addition beyond `class`/`className`: `aria-pressed` on PlayerPool filter chips (Task 3).
- Commits: conventional style, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Screenshot verification uses the scratch-dir Playwright (`node_modules/.bin/playwright*` under the session scratchpad) against the local stack + dev server; screenshots stay in the scratch dir, never committed. Demo data: run `npx tsx e2e/seed.ts` if no live draft exists (logins `e2e-cap1@test.local` / `e2e-cap2@test.local`, password `password123`; cap1 is admin — if `is_admin` was reset, re-set it via `docker exec supabase_db_FPL_website_new psql -U postgres -d postgres -c "update public.profiles set is_admin=true where id in (select id from auth.users where email='e2e-cap1@test.local');"`).

## File Structure

```
public/fpl-logo.png                      (Task 1 — downloaded crest, already in scratch dir as fpl-logo.png)
src/app/icon.png                         (Task 1 — same file; replaces default favicon; DELETE src/app/favicon.ico)
src/app/globals.css                      (Task 1 — @theme tokens + utilities; replaces zinc-era styles)
src/app/layout.tsx                       (Task 1 — fonts, header with crest + wordmark)
src/components/AuthButton.tsx            (Task 1 — styling only)
src/app/page.tsx                         (Task 1 — event-card draft list styling)
src/components/draft/DraftBoard.tsx      (Task 2 — shell/grid/ribbon styling)
src/components/draft/DraftHeader.tsx     (Task 2)
src/components/draft/CenterStage.tsx     (Task 2 — broadcast treatment)
src/components/draft/TeamColumn.tsx      (Task 2)
src/components/draft/FinalRosters.tsx    (Task 2)
src/components/draft/PlayerPool.tsx      (Task 3 — + aria-pressed on chips)
src/components/draft/BidFeed.tsx         (Task 3)
src/components/draft/BidControls.tsx     (Task 3)
src/components/draft/NominationPicker.tsx(Task 3)
src/components/draft/Toast.tsx           (Task 3)
src/app/login/page.tsx                   (Task 4)
src/app/admin/page.tsx + [draftId]/page.tsx + src/components/admin/* (Task 4)
```

---

### Task 1: Brand foundation — tokens, fonts, logo, header, home

**Files:**
- Create: `public/fpl-logo.png` (copy from scratch dir `fpl-logo.png`; if missing, re-download `https://fplexchange.com/fpl-logo.png`), `src/app/icon.png` (same bytes)
- Delete: `src/app/favicon.ico`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/AuthButton.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces (used by every later task):
  - Color tokens usable as Tailwind utilities: `bg-navy` (#001F34), `bg-panel` (#0A2A47), `border-line` (#1B4263), `text-steel` (#A7C0D8), `text-gold` / `bg-gold` / `border-gold` (#F5B62E), plus standard Tailwind `red-500`/`emerald-500` for semantics.
  - Font utilities: `font-display` (Chakra Petch var) and `font-body` (Saira var; also set as the body default).
  - CSS utility classes: `bg-hash` (diagonal texture), `label-dash` (uppercase letterspaced micro-label with leading em-dash rendered via `::before`, so it is NOT copy), `type-display` (Chakra Petch, italic, bold, uppercase, tight tracking), `btn-pill` (white pill CTA), `card-brand` (panel bg + line border + shadow).

- [ ] **Step 1: Assets**

Copy the crest from the scratch dir into `public/fpl-logo.png` and `src/app/icon.png`; delete `src/app/favicon.ico` (Next uses `icon.png` automatically).

- [ ] **Step 2: globals.css — tokens + utilities**

Replace the current theme block with (keep Tailwind import and any still-needed rules):

```css
@import "tailwindcss";

@theme {
  --color-navy: #001f34;
  --color-panel: #0a2a47;
  --color-line: #1b4263;
  --color-steel: #a7c0d8;
  --color-gold: #f5b62e;
  --font-display: var(--font-chakra), "Segoe UI", sans-serif;
  --font-body: var(--font-saira), "Segoe UI", sans-serif;
}

:root { color-scheme: dark; }

body {
  background-color: var(--color-navy);
  color: #fff;
  font-family: var(--font-body);
}

@utility bg-hash {
  background-image: repeating-linear-gradient(
    135deg,
    rgb(255 255 255 / 0.03) 0px,
    rgb(255 255 255 / 0.03) 1px,
    transparent 1px,
    transparent 14px
  );
}

@utility type-display {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}

@utility label-dash {
  font-family: var(--font-body);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--color-steel);
  &::before { content: "— "; color: #fff; }
}

@utility btn-pill {
  border-radius: 9999px;
  background: #fff;
  color: var(--color-navy);
  font-weight: 600;
  padding: 0.5rem 1.25rem;
  &:hover { background: var(--color-steel); }
}

@utility card-brand {
  background: var(--color-panel);
  border: 1px solid var(--color-line);
  border-radius: 0.5rem;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
```

(If the existing globals.css has `--background`/`--foreground` vars or `prefers-color-scheme` blocks from the scaffold, remove them.)

- [ ] **Step 3: layout.tsx — fonts + header**

```tsx
import { Chakra_Petch, Saira } from "next/font/google";

const chakra = Chakra_Petch({
  subsets: ["latin"], weight: ["600", "700"], style: ["normal", "italic"],
  variable: "--font-chakra",
});
const saira = Saira({
  subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-saira",
});
```

Apply `${chakra.variable} ${saira.variable}` to `<html>` (keep `lang="en"`), body classes `bg-navy text-white font-body antialiased`. Header: `sticky top-0 z-40`, background `rgba(0,18,31,0.9)` with `backdrop-blur`, bottom border `border-line`; contents: crest `<Image src="/fpl-logo.png" width={30} height={30} alt="" />` + wordmark `FPL EXCHANGE` in `type-display text-base` plus a `text-steel font-body not-italic` suffix `DRAFT` — the wordmark link goes home; `<AuthButton />` right-aligned. Update `metadata.title` template if desired but keep the string "FPL Draft League" present somewhere in metadata (no test depends on it; do not churn).

- [ ] **Step 4: AuthButton + home page**

AuthButton: signed-out state = `Sign in` link styled `btn-pill text-sm` (copy unchanged); signed-in = display name in `text-steel text-sm`.
Home (`page.tsx`): page wrapper `bg-hash min-h-screen`; heading block like the reference site — `label-dash` line reading `FRANCHISE PREMIER LEAGUE` above a `type-display text-5xl` heading `DRAFTS` (this page's copy is not test-sensitive; keep the draft links' hrefs identical); each draft renders as a `card-brand` block: draft name in `type-display text-xl`, status below in `text-steel text-sm`, and a `VIEW BOARD →` line in `label-dash`-style styling. Keep the `/admin` link, restyled as a small `text-steel underline-offset-4 hover:text-white` link.

- [ ] **Step 5: Gates + screenshot**

`npm run build`, `npm run lint`, `npm test`. Dev server up → scratch Playwright screenshot of `/` (logged out). Verify against `fplx_home.png` in the scratch dir: navy bg with hash texture, crest in header, italic display heading, event-style cards.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: brand foundation - tokens, fonts, crest, header, home"
```

---

### Task 2: Board core — DraftBoard shell, DraftHeader, CenterStage, TeamColumn, FinalRosters

**Files:**
- Modify: `src/components/draft/DraftBoard.tsx`, `DraftHeader.tsx`, `CenterStage.tsx`, `TeamColumn.tsx`, `FinalRosters.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/utilities. All component props unchanged.

- [ ] **Step 1: DraftBoard shell**

Page wrapper `bg-hash`; the live grid keeps its current structure/breakpoints; loading and lobby states restyled as centered `card-brand` panels with `type-display` headings; paused banner: `border border-gold/50 bg-gold/10 text-gold` with `label-dash`-style PAUSED label (copy unchanged); disconnected banner: `bg-red-500/10 border-red-500/50 text-red-400`. Captain ribbon: `card-brand` strip, team name in `type-display`, points + max bid in `text-gold font-display font-semibold not-italic`.

- [ ] **Step 2: DraftHeader**

Draft name in `type-display text-2xl`; round + minimum as `label-dash` items (`ROUND 2 — MIN 5` composed from existing values; the words themselves are not test-copy but keep the numbers rendering exactly as before); status badge: pill with status-specific colors (live = emerald-500/15 bg + emerald-400 text; paused = gold/15 + gold; setup/complete = panel + steel).

- [ ] **Step 3: CenterStage — the broadcast moment**

`card-brand` with a slightly stronger shadow. Player name `type-display text-3xl`; role/rank in `text-steel` small caps style (copy unchanged); op.gg link steel underline. Countdown: `font-display italic font-bold tabular-nums text-7xl`, gold normally, `text-red-500 animate-pulse` when `secondsLeft <= 5` (existing threshold logic/prop untouched); PAUSED shown in gold. Current bid: `type-display text-5xl text-gold` with the leading team name beneath in `text-steel`. No-lot waiting card: dashed border (`border-2 border-dashed border-line`), `text-steel`, copy string untouched.

- [ ] **Step 4: TeamColumn + FinalRosters**

TeamColumn: `card-brand`; header row = team name `type-display text-sm truncate`, nominator indicator becomes a `border-l-4 border-gold` on the card + a small gold `label-dash`-style "ON THE CLOCK" marker only if a nominator marker text ALREADY exists (if the current implementation marks the nominator purely visually, keep it visual-only — do not add copy); `isMyTeam` gets `ring-1 ring-gold/40`. Role slots: filled = role tag in `text-steel` + player name + price in `text-gold font-display font-semibold not-italic`; C/FA badges as tiny steel-outlined chips; empty = `border border-dashed border-line text-steel/60`. Footer: `points_remaining` in gold, `/ budget_start` in steel. FinalRosters: reuse the same look; total spent in gold.

- [ ] **Step 5: Gates + screenshots**

Build/lint/test. Seed if needed; screenshot `/draft/[id]` as anonymous spectator with a live lot (insert one via psql if none open, mirroring the Task 13 pattern) and with no lot (waiting state). Eyeball: navy board, gold countdown/prices, dashed empties, nominator gold edge.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: board core esports styling (center stage, teams, header)"
```

---

### Task 3: Board interactive — PlayerPool, BidFeed, BidControls, NominationPicker, Toast

**Files:**
- Modify: `src/components/draft/PlayerPool.tsx`, `BidFeed.tsx`, `BidControls.tsx`, `NominationPicker.tsx`, `Toast.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/utilities. Props and ALL copy unchanged. Only allowed non-class attribute: `aria-pressed={active}` on PlayerPool chips.

- [ ] **Step 1: PlayerPool**

Panel `card-brand`; section heading swapped to `label-dash` text `PLAYER POOL` — CAREFUL: if the current heading text is rendered differently, keep the visible words identical to today's copy, only restyle (check the component first; the em-dash comes from `label-dash`'s `::before`, never from text). Search input: navy field `bg-navy border-line text-white placeholder:text-steel/60 focus:border-gold`. Role chips: pill, inactive `bg-panel text-steel border-line`, active `bg-gold text-navy font-semibold`; add `aria-pressed`. Sold rows keep strikethrough + buyer/price with price in gold.

- [ ] **Step 2: BidFeed**

Ticker look: tight rows, `border-b border-line/50`, amounts in gold `font-display font-semibold not-italic`, team names white, player names steel. Newest-first order and row text EXACTLY as-is.

- [ ] **Step 3: BidControls + NominationPicker**

BidControls: quick-bid = `bg-gold text-navy font-display font-bold not-italic` hover brightened, disabled `opacity-40`; custom input navy-field style as pool search; secondary Bid button `border-gold text-gold` outline; blocked-reason text `text-steel text-sm` (copy unchanged). NominationPicker: `card-brand`; role group headings in `label-dash` (visible words unchanged from current implementation); rows hover `bg-navy/60`; nominate buttons outline-gold like the secondary Bid; disabled reasons steel.

- [ ] **Step 4: Toast**

`card-brand` fixed corner; error styling `border-red-500/60` with white text; keep the 4s auto-dismiss and `friendly` map byte-identical.

- [ ] **Step 5: Gates + screenshots + quick e2e**

Build/lint/test. Screenshot captain view (signed in as e2e-cap1): ribbon, bid controls on a live lot, nomination picker on their turn. THEN run `npm run e2e` once now (not waiting for Task 5) since this task touched every copy-sensitive component — must be green.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: board interactive esports styling (pool, feed, controls, toast)"
```

---

### Task 4: Login + admin pages

**Files:**
- Modify: `src/app/login/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/[draftId]/page.tsx`, `src/components/admin/DraftListClient.tsx`, `DraftSetupEditor.tsx`, `TeamEditor.tsx`, `PlayerPoolEditor.tsx`, `src/components/draft/AdminStrip.tsx`

**Interfaces:**
- Consumes: Task 1 tokens/utilities. Props/copy unchanged (login placeholders `email`, `password`, button `Sign in`, Discord button copy unchanged).

- [ ] **Step 1: Login**

`bg-hash` full-height centered column: crest `<Image>` 96px, `type-display text-2xl` app wordmark beneath, then the Discord button restyled `btn-pill w-full` (copy unchanged), divider, dev form fields in navy-field style, dev `Sign in` button as outline-steel. Error text `text-red-400`.

- [ ] **Step 2: Admin list + editor + AdminStrip**

Admin pages: `bg-hash` wrapper, `label-dash` section labels (visible words = current copy), panels `card-brand`, inputs navy-field, primary actions (`New draft`, `Start draft`) gold like quick-bid, destructive (delete/cancel/force) `border-red-500/60 text-red-400` outline, neutral steel outline otherwise. Tables: `border-line` separators, steel headers. AdminStrip: `card-brand` strip; pause/resume steel outline; undo gold outline; cancel + force-close red outline; countdown input navy-field + Save steel outline. All confirm()s and copy unchanged.

- [ ] **Step 3: Gates + screenshots**

Build/lint/test. Screenshots: `/login` logged out; `/admin` + `/admin/[draftId]` as e2e-cap1.

- [ ] **Step 4: Commit**

```powershell
git add -A; git commit -m "feat: login and admin esports styling"
```

---

### Task 5: Full verification pass

**Files:** none new (fixes only if regressions found)

- [ ] **Step 1: Full gates**

`npm run build`, `npm run lint` (exit 0), `npm test` (15/15), `npm run e2e` (green).

- [ ] **Step 2: Screenshot sweep**

Fresh seed; capture to scratch dir: home, login, spectator board (live lot + waiting + paused via admin pause), captain view (controls + picker), admin editor, complete-draft summary if cheaply reachable (optional). Compare against the `fplx_*.png` reference shots: consistent navy/hash/typography/gold across every page; no leftover zinc-gray surfaces (grep the codebase for `zinc-` and `gray-` classes — any survivor is either justified in the report or fixed).

- [ ] **Step 3: Commit any fixes**

```powershell
git add -A; git commit -m "fix: reskin polish from full verification pass"
```
(Skip the commit if no changes.)

---

## Self-Review Notes

- Spec coverage: tokens/fonts/logo/favicon (T1), signature details (T1 utilities, applied T2–T4), broadcast CenterStage + gold/red countdown (T2), pool/feed/controls/toast (T3), login/admin (T4), dark-only (`color-scheme: dark`, T1), gates incl. e2e (T3 + T5), screenshots (every task + T5 sweep), `aria-pressed` chip exception (T3). Favicon exception handled in T1.
- Copy-safety: `label-dash` renders its em-dash via CSS `::before` specifically so no visible-text nodes change; T2 Step 4 forbids adding "ON THE CLOCK" text unless equivalent copy already exists; T3/T4 repeatedly pin copy.
- Type consistency: utility names (`bg-hash`, `type-display`, `label-dash`, `btn-pill`, `card-brand`, tokens `navy/panel/line/steel/gold`) are identical across all tasks.
