# Featured Homepage Matchup Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners and admins independently select the featured fixture and edit the title and supporting text on the Premier and Academy homepages.

**Architecture:** Store Premier/Academy fixture IDs and copy fields in a dedicated `homepage_featured_settings` table so owner/admin writes cannot broaden access to unrelated league settings. Add a shared server fetcher and admin editor, enforce owner-or-admin writes in Supabase, and pass resolved copy/fixture overrides into the existing shared `FeaturedMatchup` component.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase/Postgres RLS, TypeScript, Vitest, Testing Library.

## Global Constraints

- Team names, kickoff, division, and best-of remain authoritative from schedule fixtures.
- Missing or invalid overrides fall back safely to existing homepage behavior.
- Database authorization must enforce owner-or-admin access; UI gating is presentation only.
- Follow test-first development: each behavior starts with a failing test.

---

### Task 1: Add persisted featured homepage settings and server accessors

**Files:**
- Create: `supabase/migrations/20260824000001_homepage_featured_settings.sql`
- Modify: `src/lib/home/homepageSettings.ts`
- Test: `src/lib/home/homepageSettings.test.ts`

**Interfaces:**
- Produce `HomepageFeaturedSettings = { fixtureId: string | null; title: string | null; description: string | null }`.
- Produce `fetchHomepageFeaturedSettings(homepage: "premier" | "academy"): Promise<HomepageFeaturedSettings>`.

- [x] Write tests for valid Premier/Academy settings and missing/invalid values falling back to nulls.
- [x] Run `npm test -- src/lib/home/homepageSettings.test.ts` and verify the new tests fail.
- [x] Add dedicated homepage settings storage, public-read and owner/admin-write RLS, grants, and typed fetch logic.
- [x] Run the focused test again and verify it passes.

### Task 2: Resolve homepage fixture overrides

**Files:**
- Modify: `src/lib/home/schedule.ts`
- Test: `src/lib/home/schedule.test.ts`
- Modify: `src/components/home/RegularSeasonHomePage.tsx`
- Modify: `src/components/home/AcademyHomePage.tsx`

**Interfaces:**
- Produce a helper that selects a configured fixture ID from the already fetched homepage schedule, with the first fixture as fallback.

- [x] Add a failing test for selecting a valid configured fixture and ignoring an ID not present in the scoped schedule.
- [x] Run the focused schedule test and verify failure.
- [x] Implement the minimal selection helper and load settings in both homepage server components.
- [x] Run schedule tests and homepage-related tests to verify passing behavior.

### Task 3: Make the shared featured card copy configurable

**Files:**
- Modify: `src/components/home/FeaturedMatchup.tsx`
- Test: `src/components/home/FeaturedMatchup.test.tsx`

- [x] Add a failing component test asserting custom title and supporting text render.
- [x] Run `npm test -- src/components/home/FeaturedMatchup.test.tsx` and verify failure.
- [x] Add `title` and `description` props with current copy as defaults and render them.
- [x] Run the component test and verify all cases pass.

### Task 4: Add the owner/admin editor

**Files:**
- Create: `src/components/admin/AdminFeaturedMatchupEditor.tsx`
- Modify: `src/app/admin/page.tsx`
- Test: `src/components/admin/AdminFeaturedMatchupEditor.test.tsx`

- [x] Add failing tests for separate Premier/Academy values, fixture/title/description controls, owner/admin visibility, save payload, and error feedback.
- [x] Run the focused editor test and verify failure.
- [x] Implement the shared client editor using the existing Supabase client/router refresh patterns.
- [x] Render it for staff on the admin page and load available fixture choices plus current settings server-side.
- [x] Run the focused editor test and verify passing behavior.

### Task 5: Verify the complete change

- [x] Run `npm test` (851/851 passing in feature verification; fresh run completed without test failures).
- [x] Run `npm run lint` (passes).
- [ ] Run `npm run build` (blocked by sandbox/Turbopack process binding permission).
- [ ] Review `git diff` and confirm unrelated existing user changes remain untouched.
