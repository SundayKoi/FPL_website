# Draft Preview Rank Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Correct SlimPimpin’s Season 5 rank to D1 in live data and sort each draft-preview role list from highest rank to lowest.

**Architecture:** Add an idempotent Supabase migration for the canonical player row and linked draft rows. Add a pure rank comparator in `src/lib/draft/playerMetadata.ts`, use it in `DraftSetupPreview`, and cover comparator and rendered ordering with focused tests.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase SQL migrations, Vitest, Testing Library, ESLint.

## Global Constraints

- Keep existing unrelated untracked workspace files untouched.
- Preserve explicit draft-player rank values; canonical fallback remains the source only when the draft value is blank.
- Sort unknown or missing ranks after ranked players and use player name as the deterministic tie-breaker.
- Verify with focused tests, full Vitest, and ESLint before committing or pushing.

---

### Task 1: Add the canonical data repair migration

**Files:**
- Create: `supabase/migrations/20260815000005_fix_slimpimpin_rank.sql`

**Interfaces:**
- Produces an idempotent database repair that later preview fetches observe.

- [ ] **Step 1: Write the migration**

Use an `UPDATE ... FROM` statement to set `player_pool.rank = 'D1'` for `season_key = 'season-5'` and `normalized_name = 'slimpimpin77'`, then update all linked `players` rows where `canonical_player_id` matches that canonical row to `D1`. Keep both statements no-op safe if the row is absent.

- [ ] **Step 2: Inspect the migration for safety**

Run `git diff --check` and verify the predicates include both the season and normalized name.

- [ ] **Step 3: Commit the migration**

Run `git add supabase/migrations/20260815000005_fix_slimpimpin_rank.sql && git commit -m "fix: correct slimpimpin draft rank"`.

### Task 2: Add and test rank ordering

**Files:**
- Modify: `src/lib/draft/playerMetadata.ts`
- Create: `src/lib/draft/playerMetadata.order.test.ts`

**Interfaces:**
- Produces `comparePlayerRanks(left: string | null, right: string | null): number`, returning a negative value when `left` should appear first.

- [ ] **Step 1: Write the failing comparator tests**

Cover `M10` before `D1`, `D1` before `D2`, `D2` before `E1`, and null/unknown after known ranks. Also cover equal ranks returning `0`.

- [ ] **Step 2: Run the focused test and verify failure**

Run `npx vitest run src/lib/draft/playerMetadata.order.test.ts`; expect failure because `comparePlayerRanks` is not yet exported.

- [ ] **Step 3: Implement the minimal comparator**

Parse the first letter as tier priority `M: 3`, `D: 2`, `E: 1`; parse the trailing number and compare lower division numbers first. Treat malformed or missing values as rank priority `0`.

- [ ] **Step 4: Run the focused tests**

Run `npx vitest run src/lib/draft/playerMetadata.test.ts src/lib/draft/playerMetadata.order.test.ts`; expect all tests to pass.

- [ ] **Step 5: Commit the helper**

Run `git add src/lib/draft/playerMetadata.ts src/lib/draft/playerMetadata.order.test.ts && git commit -m "feat: add draft rank ordering helper"`.

### Task 3: Sort the draft preview player board

**Files:**
- Modify: `src/components/draft/DraftSetupPreview.tsx`
- Modify: `src/components/draft/DraftSetupPreview.test.tsx`

**Interfaces:**
- Consumes `comparePlayerRanks` from `@/lib/draft/playerMetadata`.
- Produces role columns whose available player rows are rank-sorted, with alphabetical name tie-breaking.

- [ ] **Step 1: Extend the component test**

Add several same-role players with ranks `E1`, `D2`, `D1`, and null, render the preview, and assert their DOM order is `D1`, `D2`, `E1`, then the unranked player.

- [ ] **Step 2: Run the component test and verify failure**

Run `npx vitest run src/components/draft/DraftSetupPreview.test.tsx`; expect the new ordering assertion to fail against insertion order.

- [ ] **Step 3: Implement sorted role lists**

For each role, create a sorted copy of the filtered available players using `comparePlayerRanks`, then compare `display_name.toLowerCase()` when ranks tie. Render that sorted copy without mutating the source `players` array.

- [ ] **Step 4: Run the focused component tests**

Run `npx vitest run src/components/draft/DraftSetupPreview.test.tsx`; expect all tests to pass.

- [ ] **Step 5: Commit the preview behavior**

Run `git add src/components/draft/DraftSetupPreview.tsx src/components/draft/DraftSetupPreview.test.tsx && git commit -m "feat: sort draft preview players by rank"`.

### Task 4: Full verification and publish

**Files:**
- No additional source files.

- [ ] **Step 1: Run full verification**

Run `npm test -- --run`, then `npm run lint`, then `git diff --check`.

- [ ] **Step 2: Review the final diff and status**

Run `git status --short --branch` and `git log --oneline -5`; confirm `main` contains only the intended commits and unrelated untracked files remain unstaged.

- [ ] **Step 3: Push main**

Run `git push origin main` and confirm the remote advances successfully.
