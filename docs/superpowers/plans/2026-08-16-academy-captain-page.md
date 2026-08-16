# Academy Captain Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully parallel Academy captain league to the existing `/captain` workflow without changing Premier behavior.

**Architecture:** Keep one captain page and shared components, adding a normalized `League` value and explicit league scope to shared queries and database records. `/captain` selects Premier and `/captain?league=academy` selects Academy from `league_settings.academy_draft_id`; RLS and all admin mutations enforce the same scope.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres migrations and pgTAP, Vitest, Testing Library, Tailwind CSS 4.

## Global Constraints

- `/captain` means Premier and `/captain?league=academy` means Academy.
- Invalid or repeated league values resolve to Premier.
- Existing rows are backfilled to `premier` and existing Premier behavior remains intact.
- Academy never falls back to Premier when Academy is unconfigured.
- Shared components remain shared; do not duplicate an Academy component tree.
- Preserve unrelated worktree changes.
- Follow the Next.js App Router guidance in `node_modules/next/dist/docs/`.

---

### Task 1: Add league primitives and database schema

**Files:**
- Create: `src/lib/captain/league.ts`
- Modify: `src/lib/matches/types.ts`
- Modify: `src/lib/schedule/types.ts`
- Modify: `src/lib/captain/queries.ts`
- Create: `supabase/migrations/20260816000006_academy_captain_league.sql`
- Create: `supabase/tests/0046_academy_captain_league_test.sql`
- Test: `src/lib/captain/league.test.ts`

**Interfaces:**
- Produces `type League = "premier" | "academy"`, `normalizeLeague(value: unknown): League`, `leagueLabel(league: League): string`, and `draftSettingColumn(league: League): "featured_draft_id" | "academy_draft_id"`.
- Extends `LeagueTeam`, `FixtureRow`, and captain/report row types with `league: League`.
- Makes `CaptainContext` expose `league`, `teams`, `activeTeams`, `myTeamId`, and `academyConfigured` for the selected league.

- [ ] **Step 1: Write failing unit tests for league normalization.**

  Cover missing, invalid, array, `premier`, and `academy` values; only the exact scalar `academy` selects Academy.

- [ ] **Step 2: Run the focused test and confirm failure.**

  Run: `npm test -- src/lib/captain/league.test.ts`

  Expected: module/function-not-found failures.

- [ ] **Step 3: Implement `src/lib/captain/league.ts`.**

  Keep the parser pure and make array input resolve to Premier. Map display labels to `Premier` and `Academy`, and map settings columns to the two existing settings fields.

- [ ] **Step 4: Add the migration with Premier backfills and indexes.**

  Add constrained `league text not null default 'premier'` columns to `league_teams`, `league_team_captains`, `fixtures`, `match_reports`, `match_report_games` only where needed by existing query paths, `match_codes`, `roster_memberships`, `announcements`, and the stats identity tables used by captain results. Backfill existing rows before enforcing not-null. Add league-aware uniqueness/indexes and preserve existing policies while tightening captain/code/report checks to include league.

- [ ] **Step 5: Add pgTAP coverage for schema and isolation.**

  Assert columns/defaults/index-relevant uniqueness, Premier backfill, Academy rows, and that a captain assigned to a Premier team cannot select Academy codes/reports while an Academy captain can access only Academy rows.

- [ ] **Step 6: Run the unit tests and local database test if available.**

  Run: `npm test -- src/lib/captain/league.test.ts` and `supabase db reset` followed by the focused pgTAP test when the Supabase CLI is available.

### Task 2: Make captain context and data queries league-aware

**Files:**
- Modify: `src/lib/captain/queries.ts`
- Modify: `src/lib/captain/queries.test.ts`
- Modify: `src/lib/captain/nextMatch.ts`
- Modify: `src/lib/captain/nextMatch.test.ts`
- Modify: stats query/type files used by `fetchMyResults`

**Interfaces:**
- `fetchCaptainContext(supabase, league: League): Promise<CaptainContext>` resolves the selected league’s draft and captain rows.
- `fetchCodes(supabase, fixtureId, league)` and `fetchMyReports(supabase, teamId, season, league)` enforce league filters.
- `fetchMyRoster(supabase, teamId, season, league)` loads the selected league draft and scoped memberships.
- `fetchMyResults(supabase, teamName, season, league)` filters stats by league.
- `fetchAnnouncements(supabase, league)` returns only the active league’s announcements.

- [ ] **Step 1: Add failing tests for Academy context and query filters.**

  Assert Academy selects `academy_draft_id`, captain lookup includes `league`, and every Academy fetcher adds the league filter. Assert Premier remains the default when called without an explicit league only where backward compatibility is intentionally retained.

- [ ] **Step 2: Run focused query tests and confirm failure.**

  Run: `npm test -- src/lib/captain/queries.test.ts src/lib/captain/nextMatch.test.ts`

- [ ] **Step 3: Implement league-aware context and fetchers.**

  Keep one query path per function. Pass the league to all Supabase filters and use the correct settings draft column. Do not resolve Academy through the Premier featured draft.

- [ ] **Step 4: Update next-fixture resolution to require league-compatible fixture input.**

  Keep name normalization unchanged, but filter fixtures by the selected league before choosing the earliest unplayed fixture.

- [ ] **Step 5: Run the focused tests and typecheck through the test runner.**

  Run: `npm test -- src/lib/captain/queries.test.ts src/lib/captain/nextMatch.test.ts`

### Task 3: Add the Academy page mode and admin league/team switching

**Files:**
- Modify: `src/app/captain/page.tsx`
- Modify: `src/app/captain/page.test.tsx`
- Modify: `src/components/captain/CaptainGate.tsx`
- Create or modify: `src/components/captain/LeagueSwitcher.tsx`
- Modify: `src/components/matches/LeagueTeamsEditor.tsx`
- Modify: `src/components/matches/RosterEditor.tsx`

**Interfaces:**
- `CaptainPage` accepts `searchParams` and normalizes `league` server-side.
- `LeagueSwitcher` renders Premier/Academy links and the admin team selector while preserving the active league.
- Admin editors receive `league` and include it in every mutation/sync call.

- [ ] **Step 1: Add failing page tests.**

  Cover Premier default, Academy heading/URL, regular captain denial when they have no Academy assignment, Academy-not-configured state, admin league switching, and active-team selection scoped to Academy.

- [ ] **Step 2: Run the page test and confirm failure.**

  Run: `npm test -- src/app/captain/page.test.tsx`

- [ ] **Step 3: Implement server-side league selection and context gating.**

  Normalize the query once. Fetch context for that league. For Academy with no configured draft, render the explicit empty state before requesting Premier data. For regular captains, use only their league-scoped `myTeamId`; for admins, validate both `league` and `team` against the selected context.

- [ ] **Step 4: Add the league switcher and pass the active league to all sections/editors.**

  Keep `/captain` and `/captain?league=academy` linkable, preserve `team` when switching leagues for admins only, and label the page with the active league.

- [ ] **Step 5: Update admin editor mutation props and preserve Premier defaults.**

  Add league arguments to code replacement, captain sync, team edits, roster edits, and membership edits. Existing Premier UI calls pass `premier` explicitly.

- [ ] **Step 6: Run the focused page/component tests.**

  Run: `npm test -- src/app/captain/page.test.tsx src/components/matches/LeagueTeamsEditor.test.tsx src/components/matches/RosterEditor.test.tsx`

### Task 4: Scope report submission, codes, and private access

**Files:**
- Modify: `src/components/captain/ReportBox.tsx`
- Modify: `src/components/captain/AdminCodeEditor.tsx`
- Modify: `src/components/captain/AdminReportsQueue.tsx`
- Modify: `src/lib/captain/queries.ts`
- Modify: `supabase/migrations/20260816000006_academy_captain_league.sql`
- Modify: relevant component tests and pgTAP tests

**Interfaces:**
- `ReportBox` receives `league` and submits it through `submitReport`.
- Admin code/report components receive `league` and never load or mutate another league’s rows.

- [ ] **Step 1: Add failing component/query tests for Academy submissions and editor isolation.**

  Assert Academy payloads carry `league: "academy"`, report/code lists are filtered, and error messages identify Academy captain setup when relevant.

- [ ] **Step 2: Update report submission and code/report editor calls.**

  Include league in payloads, Supabase filters, and RPC arguments. Keep the same parser and form behavior.

- [ ] **Step 3: Verify database RLS isolation.**

  Extend pgTAP so cross-league captain access is denied for `match_codes`, `match_reports`, and report games, while admins can manage both leagues.

- [ ] **Step 4: Run focused tests.**

  Run: `npm test -- src/components/captain src/lib/captain`.

### Task 5: Scope rosters, results, announcements, and finish verification

**Files:**
- Modify: `src/components/captain/MyRoster.tsx`
- Modify: `src/components/captain/MyResults.tsx`
- Modify: `src/components/captain/Announcements.tsx`
- Modify: stats ingestion/query/type files identified in Task 2
- Modify: any remaining captain tests

- [ ] **Step 1: Add failing tests for Academy roster/results/announcement separation.**

  Use same-named Premier and Academy teams in fixtures to prove the league discriminator, not the display name alone, selects the correct data.

- [ ] **Step 2: Implement league-scoped roster, stats, and announcement reads.**

  Preserve the current visual sections and empty states; only the data scope and active-league copy change.

- [ ] **Step 3: Run all captain and stats tests.**

  Run: `npm test -- src/app/captain src/components/captain src/lib/captain src/lib/stats`

- [ ] **Step 4: Run full verification.**

  Run: `npm test`, `npm run lint`, and `git diff --check`. Run Supabase reset/pgTAP if available. Inspect the final diff for accidental changes to unrelated dirty files.

- [ ] **Step 5: Report the blocked commit separately if `.git` remains read-only.**

  Do not overwrite or reset the user’s existing changes; provide the exact spec/plan and implementation paths for the user to commit locally.
