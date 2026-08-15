# Optional Second Draft Captain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins assign one optional second captain per draft team, with full nomination, bidding, and Nemesis permissions.

**Architecture:** Keep `teams.captain_profile_id` as the required primary captain and add nullable `teams.captain_profile_id_2`. Centralize live-draft authorization in the existing `caller_team` helper, update the one direct Nemesis gate, and make the client resolve a team through either captain field.

**Tech Stack:** Next.js 16.3.0, React 19, TypeScript, Supabase/PostgreSQL migrations and pgTAP tests, Vitest, ESLint.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code, per `AGENTS.md`.
- The primary captain remains required to start a draft; the second captain remains optional.
- Do not change the separate league-season captain model or captain-page permissions.
- Follow TDD: write each behavioral test first, run it failing, then implement the minimum change.
- Preserve unrelated working-tree changes and stage only files belonging to this feature in commits.

---

### Task 1: Prepare the implementation workspace and confirm framework conventions

**Files:**
- Read: `AGENTS.md`
- Read: `node_modules/next/dist/docs/01-app/index.md` and any linked guide needed for the existing app-router patterns
- Read: `docs/superpowers/specs/2026-08-15-second-draft-captain-design.md`

**Interfaces:**
- Consumes: approved design spec and repository instructions.
- Produces: confirmed file conventions and an isolated worktree/branch before code changes.

- [ ] **Step 1: Create or verify an isolated feature worktree/branch.**

Use the repository’s existing worktree workflow and a `codex/` branch name. Do not modify `main` directly.

- [ ] **Step 2: Read the Next.js app-router guidance.**

Confirm the current async `params` convention used by `src/app/admin/[draftId]/page.tsx` remains the pattern to follow; no new Next.js API is needed for this feature.

- [ ] **Step 3: Inspect the current migration/test conventions.**

Use `supabase/migrations/` for the new timestamped migration, `supabase/tests/` for pgTAP coverage, and existing Vitest component tests as the naming and mocking reference.

### Task 2: Add the second-captain schema and database authorization

**Files:**
- Create: `supabase/migrations/20260815000001_optional_second_draft_captain.sql`
- Create: `supabase/tests/0039_optional_second_draft_captain_test.sql`

**Interfaces:**
- Consumes: existing `public.teams`, `public.profiles`, `public.caller_team(uuid)`, `public.start_draft(uuid)`, and the `pick_nemesis_team` RPC signature.
- Produces: `teams.captain_profile_id_2`, updated `caller_team(uuid)`, and second-captain authorization for Nemesis picks.

- [ ] **Step 1: Write the failing database tests.**

Add pgTAP cases that create a draft with two teams and profiles, then assert:

```sql
select lives_ok($$ update public.teams
  set captain_profile_id_2 = (select id from public.profiles where display_name = 'Second')
  where id = (select id from public.teams where draft_id = (select d from t) order by nomination_position limit 1)
$$, 'admin can assign an optional second captain');

select throws_ok($$ update public.teams
  set captain_profile_id_2 = captain_profile_id
  where id = (select id from public.teams where draft_id = (select d from t) order by nomination_position limit 1)
$$, '23514', null, 'primary and second captain cannot be the same profile');

select lives_ok($$ select tests.acting_as((select id from public.profiles where display_name = 'Second')) $$,
  'second captain can authenticate');
select lives_ok($$ select public.caller_team((select d from t)) $$,
  'second captain resolves the team through caller_team');
```

Use the repository’s fixture helpers and existing draft RPC tests to exercise nomination/bidding/Nemesis with the second profile. Assert a team with only a primary captain still starts successfully when the rest of setup is valid, and a team with no primary captain still fails `start_draft`.

- [ ] **Step 2: Run the new SQL test to verify it fails for the missing column/authorization.**

Run the project’s established Supabase test command for the focused file, or if the local database test harness is unavailable, run the repository’s documented SQL test command and record the environment blocker without weakening the test.

Expected: failure because `captain_profile_id_2` does not yet exist and the second profile is rejected by the current authorization path.

- [ ] **Step 3: Add the migration.**

Add:

```sql
alter table public.teams
  add column captain_profile_id_2 uuid references public.profiles(id);

create unique index teams_second_captain_per_draft
  on public.teams (draft_id, captain_profile_id_2)
  where captain_profile_id_2 is not null;

alter table public.teams
  add constraint teams_distinct_captains
  check (captain_profile_id_2 is null or captain_profile_id_2 <> captain_profile_id);
```

Replace `caller_team(uuid)` with the same return type and error behavior, changing only its predicate to:

```sql
where t.draft_id = p_draft_id
  and (t.captain_profile_id = auth.uid()
       or t.captain_profile_id_2 = auth.uid());
```

Keep `start_draft`’s existing `captain_profile_id is null` requirement unchanged. Update the Nemesis RPC’s captain check to accept either captain column.

- [ ] **Step 4: Run the focused SQL tests to verify they pass.**

Expected: optional assignment, duplicate rejection, second-captain `caller_team`, nomination/bidding/Nemesis authorization, and primary-captain start validation all pass.

- [ ] **Step 5: Commit the database change.**

```bash
git add supabase/migrations/20260815000001_optional_second_draft_captain.sql supabase/tests/0039_optional_second_draft_captain_test.sql
git commit -m "feat: authorize optional second draft captains"
```

### Task 3: Extend shared TypeScript draft state for either captain

**Files:**
- Modify: `src/lib/draft/types.ts`
- Modify: `src/hooks/useDraftState.ts`
- Test: `src/hooks/useDraftState.test.ts` (create if no existing hook test covers team resolution)

**Interfaces:**
- Consumes: `Team` rows containing `captain_profile_id_2`.
- Produces: `Team.captain_profile_id_2: string | null` and `myTeam` resolution for either captain.

- [ ] **Step 1: Write the failing state test.**

Add a test fixture with a team whose primary captain is `profile-primary` and second captain is `profile-secondary`; assert that the secondary profile resolves the same team and that an unrelated profile resolves `null`.

- [ ] **Step 2: Run the focused Vitest test and verify the expected failure.**

Run `npx vitest run src/hooks/useDraftState.test.ts`. Expected: the test fails because the current team lookup only checks `captain_profile_id`.

- [ ] **Step 3: Add the optional field and update the lookup.**

Extend `Team` with:

```ts
captain_profile_id_2: string | null;
```

Change `useDraftState`’s `myTeam` predicate to match either captain field while retaining the existing `profileId` null guard.

- [ ] **Step 4: Run the focused Vitest test and the draft library tests.**

Run `npx vitest run src/hooks/useDraftState.test.ts src/lib/draft`. Expected: all pass.

- [ ] **Step 5: Commit the shared state change.**

```bash
git add src/lib/draft/types.ts src/hooks/useDraftState.ts src/hooks/useDraftState.test.ts
git commit -m "feat: recognize second draft captains in client state"
```

### Task 4: Add admin assignment UI and setup preview coverage

**Files:**
- Modify: `src/components/admin/TeamEditor.tsx`
- Modify: `src/components/draft/DraftSetupPreview.tsx`
- Modify: `src/components/admin/TeamEditor.test.tsx`
- Modify: `src/components/draft/DraftSetupPreview.test.tsx`

**Interfaces:**
- Consumes: `Team.captain_profile_id_2` and the existing admin `teams.update` flow.
- Produces: optional second-captain selector, primary-captain exclusion, clear-to-null behavior, and preview status.

- [ ] **Step 1: Write failing component tests.**

In `TeamEditor.test.tsx`, render a team with a primary captain and assert:

```ts
expect(screen.getByLabelText("Second captain")).toBeInTheDocument();
expect(within(screen.getByLabelText("Second captain"))
  .queryByRole("option", { name: "Primary" })).toBeNull();
```

Select a secondary profile and assert the Supabase update is called with `{ captain_profile_id_2: "profile-secondary" }`. Select the empty option and assert it is called with `{ captain_profile_id_2: null }`.

In `DraftSetupPreview.test.tsx`, assert a team with a second captain renders the “Second captain assigned” indicator and a team without one retains the pending/primary status behavior. The preview currently receives no profile list, so it should not attempt to render a profile name.

- [ ] **Step 2: Run the focused component tests and verify they fail.**

Run `npx vitest run src/components/admin/TeamEditor.test.tsx src/components/draft/DraftSetupPreview.test.tsx`. Expected: failure because the second selector and preview output do not exist.

- [ ] **Step 3: Implement the selectors.**

Add a labeled optional select adjacent to the existing Captain select. Its value is `team.captain_profile_id_2 ?? ""`; on change call `updateTeam(team, { captain_profile_id_2: value || null })`. Filter its profile options with `p.id !== team.captain_profile_id`.

Keep the existing primary selector unchanged. Ensure the second selector remains editable while the primary is empty, but cannot choose the same profile once a primary is selected.

- [ ] **Step 4: Implement the preview indicator.**

Keep the existing “Captain assigned/pending” badge based on the primary field and add a compact secondary line when `team.captain_profile_id_2` is non-null, using the matching profile only if profile data is passed to the preview; otherwise display an unambiguous “Second captain assigned” status without changing the preview component’s current props unnecessarily.

- [ ] **Step 5: Run focused tests and TypeScript checks.**

Run the two focused Vitest files and `npx tsc --noEmit`. Expected: all focused tests pass and the new field is accepted by all existing Team fixtures after adding `null` to fixtures where required.

- [ ] **Step 6: Commit the UI change.**

```bash
git add src/components/admin/TeamEditor.tsx src/components/admin/TeamEditor.test.tsx src/components/draft/DraftSetupPreview.tsx src/components/draft/DraftSetupPreview.test.tsx
git commit -m "feat: add optional second captain setup control"
```

### Task 5: Run full verification and review the feature boundary

**Files:**
- Modify: only files needed to resolve verified failures from the commands below

**Interfaces:**
- Consumes: completed schema, authorization, state, and UI changes.
- Produces: verified feature with no unrelated file changes.

- [ ] **Step 1: Inspect the final diff and check for accidental edits.**

Run `git status --short` and `git diff main...HEAD --stat` from the feature worktree. Confirm only the migration, SQL test, draft type/state files, admin/preview UI files, their tests, and any necessary generated metadata are included.

- [ ] **Step 2: Run the complete Vitest suite.**

Run `npm test`. Expected: exit code 0 with zero failed tests.

- [ ] **Step 3: Run lint and TypeScript validation.**

Run `npm run lint` and `npx tsc --noEmit`. Expected: both exit code 0.

- [ ] **Step 4: Run the production build.**

Run `npm run build`. Expected: exit code 0.

- [ ] **Step 5: Run the available Supabase SQL tests.**

Run the repository’s configured Supabase test command, including `supabase/tests/0039_optional_second_draft_captain_test.sql`. Expected: all SQL assertions pass; if local Supabase is unavailable, report the exact command/output rather than claiming database verification.

- [ ] **Step 6: Perform a final requirements check.**

Verify that:

- an admin can assign, change, and clear the optional second captain;
- the second captain is excluded from the primary captain’s selector;
- the second captain sees the same team and controls in the draft client;
- nomination, bidding, and Nemesis authorization accept either captain;
- the primary captain remains required to start a draft;
- league-season captain behavior is unchanged.

- [ ] **Step 7: Commit any final verified fixes separately.**

```bash
git add supabase/migrations/20260815000001_optional_second_draft_captain.sql supabase/tests/0039_optional_second_draft_captain_test.sql src/lib/draft/types.ts src/hooks/useDraftState.ts src/hooks/useDraftState.test.ts src/components/admin/TeamEditor.tsx src/components/admin/TeamEditor.test.tsx src/components/draft/DraftSetupPreview.tsx src/components/draft/DraftSetupPreview.test.tsx
git commit -m "fix: address second captain verification findings"
```
