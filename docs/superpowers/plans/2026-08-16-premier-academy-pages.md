# Premier and Academy Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Academy routes alongside the existing Premier routes, with header dropdowns, page toggles, Academy draft-backed data, sheet-backed player OP.GG links, and a separate Academy Captain page.

**Architecture:** Keep existing Premier pages as the default implementation and extract only shared route/data helpers needed by Academy. Add an Academy route tree under `src/app/academy`, a reusable page toggle, and draft/team-name filtering helpers. Academy player links come only from the configured Google Sheet CSV response; no URL is synthesized.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase server/client APIs, Vitest, Tailwind CSS.

## Global Constraints

- Premier URLs and current Premier behavior remain stable.
- Academy data resolves from `league_settings.academy_draft_id`, falling back to draft name `S1 Academy`.
- Academy OP.GG links must be read from the provided spreadsheet source; never infer or construct an OP.GG URL.
- Academy schedule/stats must exclude records whose team names are not in the Academy draft team set.
- Preserve unrelated working-tree changes.

---

### Task 1: Add shared league context and route-toggle helpers

**Files:**
- Create: `src/lib/league/context.ts`
- Create: `src/lib/league/links.ts`
- Create: `src/components/LeaguePageToggle.tsx`
- Test: `src/lib/league/context.test.ts`
- Test: `src/lib/league/links.test.ts`

- [ ] **Step 1: Write failing tests** for Academy fallback resolution, normalized team-name matching, paired links, and stats query preservation.
- [ ] **Step 2: Run focused tests and verify they fail for missing helpers.**
- [ ] **Step 3: Implement typed helpers** for `premier`/`academy` league context, draft lookup, normalized team-name sets, and route link construction.
- [ ] **Step 4: Implement `LeaguePageToggle`** with accessible current state and paired route links.
- [ ] **Step 5: Run focused tests and lint the new files.**

### Task 2: Refactor shared header navigation into Premier and Academy dropdowns

**Files:**
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`

- [ ] **Step 1: Add failing tests** for Premier/Academy dropdown destinations, dropdown accessibility, active Academy routes, and preserved existing Info/Premium menus.
- [ ] **Step 2: Run the navigation tests and verify the new assertions fail.**
- [ ] **Step 3: Add the two league dropdowns** without regressing mobile, Escape, outside-click, or route-change behavior.
- [ ] **Step 4: Run the navigation test file and lint.**

### Task 3: Add the Academy player-sheet adapter

**Files:**
- Create: `src/lib/academy/playerSheet.ts`
- Create: `src/lib/academy/playerSheet.test.ts`
- Modify: `src/app/academy/players/page.tsx`
- Modify: `src/components/players/PlayersDirectory.tsx`

- [ ] **Step 1: Write failing parser tests** using CSV fixtures with name, role, rank, and OP.GG columns, including missing/malformed links.
- [ ] **Step 2: Run the parser tests and verify they fail.**
- [ ] **Step 3: Implement server-side sheet fetch and header-based CSV parsing.** Accept only absolute `http`/`https` URLs from the sheet; return `null` for absent or invalid values. Do not build a URL from a player name.
- [ ] **Step 4: Add Academy player directory rendering** with Academy labels, sheet values, and draft membership filtering.
- [ ] **Step 5: Run the adapter, PlayersDirectory, and Academy Players tests.**

### Task 4: Create Academy Teams and Players routes with toggles

**Files:**
- Create: `src/app/academy/teams/page.tsx`
- Create: `src/app/academy/players/page.test.tsx`
- Create: `src/app/academy/teams/page.test.tsx`
- Modify: `src/app/teams/page.tsx`
- Modify: `src/app/players/page.tsx`
- Modify: `src/components/teams/TeamsDirectory.tsx`
- Modify: `src/components/players/PlayersDirectory.tsx`

- [ ] **Step 1: Add failing route tests** for Academy draft loading, Academy headings, toggles, and missing-draft empty states.
- [ ] **Step 2: Run route tests and verify they fail.**
- [ ] **Step 3: Implement `/academy/teams`** using the shared draft resolver and existing roster/editor components, with Academy-only data.
- [ ] **Step 4: Add the page toggle to Premier and Academy Teams/Players** while preserving existing admin controls only where appropriate.
- [ ] **Step 5: Run focused route/component tests.**

### Task 5: Add Academy schedule and stats filtering

**Files:**
- Create: `src/lib/academy/filtering.ts`
- Create: `src/lib/academy/filtering.test.ts`
- Create: `src/app/academy/schedule/page.tsx`
- Create: `src/app/academy/stats/page.tsx`
- Create: `src/app/academy/schedule/page.test.tsx`
- Modify: `src/app/schedule/page.tsx`
- Modify: `src/app/stats/page.tsx`
- Modify: `src/lib/stats/queries.ts`
- Modify: `src/components/stats/StatsTabs.tsx`

- [ ] **Step 1: Write failing filtering tests** proving Premier team rows and fixtures are excluded from Academy results.
- [ ] **Step 2: Run filtering tests and verify they fail.**
- [ ] **Step 3: Implement normalized team-name filtering** for fixtures and stats rows, including timeline/player association filtering.
- [ ] **Step 4: Implement Academy Schedule and Stats pages** with headings, empty states, and paired toggles; keep Premier behavior unchanged.
- [ ] **Step 5: Run focused filtering and page tests.**

### Task 6: Add Academy Home and shared home data context

**Files:**
- Create: `src/app/academy/page.tsx`
- Create: `src/app/academy/page.test.tsx`
- Modify: `src/lib/home/standings.ts`
- Modify: `src/lib/home/schedule.ts`
- Modify: `src/components/home/PreseasonHomePage.tsx`
- Modify: `src/components/home/RegularSeasonHomePage.tsx`

- [ ] **Step 1: Add failing tests** for Academy draft-backed standings, Academy-only upcoming fixtures, heading/toggle content, and Premier default behavior.
- [ ] **Step 2: Run the home tests and verify they fail.**
- [ ] **Step 3: Parameterize home standings/schedule loaders** by league context and filter Academy data by draft team names.
- [ ] **Step 4: Render `/academy`** through the existing home phases with Academy labeling and shared editorial sections only where data is not league-specific.
- [ ] **Step 5: Run focused home tests.**

### Task 7: Add Academy Captain page and league isolation

**Files:**
- Create: `src/app/academy/captain/page.tsx`
- Create: `src/app/academy/captain/page.test.tsx`
- Modify: `src/lib/captain/queries.ts`
- Modify: `src/app/captain/page.tsx`
- Modify: `src/components/captain/CaptainGate.tsx`

- [ ] **Step 1: Add failing tests** for Academy-only captain lookup, team selector isolation, Academy fixture/report/result filtering, and Premier route stability.
- [ ] **Step 2: Run Captain tests and verify they fail.**
- [ ] **Step 3: Add a league-scoped Captain context** that maps Academy draft teams to captain teams without exposing Premier teams.
- [ ] **Step 4: Implement `/academy/captain`** by reusing safe Captain components and filtering every admin/user data set to Academy teams.
- [ ] **Step 5: Add the page toggle and run focused Captain tests.**

### Task 8: Compatibility, full verification, and handoff

**Files:**
- Modify: `src/app/teams/page.tsx`
- Create or modify: `src/app/teams/compatibility.test.tsx`

- [ ] **Step 1: Add compatibility coverage** for `/teams?view=academy` redirect or stable link behavior and Premier `/teams` defaults.
- [ ] **Step 2: Run `npm test`.**
- [ ] **Step 3: Run `npm run lint`.**
- [ ] **Step 4: Run `npm run build`.**
- [ ] **Step 5: Run relevant Playwright smoke tests or report any environment blocker.**
- [ ] **Step 6: Review the diff and confirm no OP.GG URLs were added outside sheet-derived data.**
