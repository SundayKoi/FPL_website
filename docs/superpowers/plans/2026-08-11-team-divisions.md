# Team Divisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin-assigned Lunari/Solari divisions with an Unassigned fallback to the teams directory.

**Architecture:** Persist a nullable constrained `teams.division` value, carry it through the shared team and roster view types, and group cards in the server-rendered directory. The existing client-side team editor will submit the division alongside the existing identity fields.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase migrations/pgTAP, Vitest, Testing Library, Tailwind utility classes.

## Global Constraints

- Allowed persisted division values are exactly `Lunari`, `Solari`, or `NULL`.
- `NULL` is displayed as `Unassigned`.
- Public section order is Lunari, Solari, Unassigned; empty sections are omitted.
- Preserve team order within each section and existing image/error/refresh behavior.
- Change only the `— ROSTER` suffix to black text.

### Task 1: Add the division data model and view plumbing

**Files:**
- Create: `supabase/migrations/20260811000006_team_divisions.sql`
- Create: `supabase/tests/0020_team_divisions_test.sql`
- Modify: `src/lib/schedule/types.ts`
- Modify: `src/lib/draft/types.ts`
- Modify: `src/lib/teams/roster.ts`
- Test: `src/lib/teams/roster.test.ts`

**Interfaces:**
- Reuse `Division` and `DIVISIONS` from `src/lib/schedule/types.ts`.
- `Team.division` and `RosterTeamView.division` are `Division | null`.

- [ ] **Step 1: Write failing unit coverage for preserving division.**

  Extend the existing roster fixture with `division: "Lunari"` and assert `toRosterTeams(...)[0].division` is `"Lunari"`; add a null case if the fixture structure allows it.

- [ ] **Step 2: Run the focused roster test and verify it fails because the property is absent.**

  Run: `npx vitest run src/lib/teams/roster.test.ts`

- [ ] **Step 3: Add the nullable constrained migration.**

  Add `division text` to `public.teams` with a check constraint allowing `Lunari`, `Solari`, or null. Do not backfill existing rows.

- [ ] **Step 4: Update shared types and roster transformation.**

  Add `division: Division | null` to `Team` and `RosterTeamView`; copy `team.division` in `toRosterTeams`.

- [ ] **Step 5: Run the focused roster test and verify it passes.**

  Run: `npx vitest run src/lib/teams/roster.test.ts`

- [ ] **Step 6: Add pgTAP coverage.**

  Assert the column exists, defaults to null for new rows, accepts both division values and null, and rejects an invalid value through the constraint.

### Task 2: Group public cards and assign preview divisions

**Files:**
- Modify: `src/components/teams/TeamsDirectory.tsx`
- Modify: `src/components/teams/TeamsDirectory.test.tsx`
- Modify: `src/components/teams/placeholderTeams.ts`
- Modify: `src/components/teams/TeamRosterCard.tsx`

**Interfaces:**
- Consume `RosterTeamView.division` from Task 1.
- Keep `TeamsDirectory` props unchanged apart from the enriched team view.

- [ ] **Step 1: Write failing directory tests for section order and omission.**

  Render one team in each division, assert headings occur as `Lunari`, `Solari`, `Unassigned`, and assert a render containing only Lunari has no Solari or Unassigned headings.

- [ ] **Step 2: Run the focused directory test and verify it fails because cards are not grouped.**

  Run: `npx vitest run src/components/teams/TeamsDirectory.test.tsx`

- [ ] **Step 3: Assign deterministic divisions to preview teams.**

  Add `division` to each placeholder `RosterTeamView`, distributing the twelve teams across Lunari, Solari, and Unassigned.

- [ ] **Step 4: Implement ordered grouping in `TeamsDirectory`.**

  Build the fixed section list, filter each section’s teams, omit empty sections, and render the existing responsive grid under an accessible heading.

- [ ] **Step 5: Change only the roster suffix text color.**

  In `TeamRosterCard`, replace the suffix’s white text utility with the black text utility while preserving the rest of the card markup.

- [ ] **Step 6: Run focused directory and card tests.**

  Run: `npx vitest run src/components/teams/TeamsDirectory.test.tsx src/components/teams/TeamRosterCard.test.tsx`

### Task 3: Add division editing to the admin form

**Files:**
- Modify: `src/components/teams/AdminTeamEditor.tsx`
- Modify: `src/components/teams/AdminTeamEditor.test.tsx`

**Interfaces:**
- Consume `Team.division` from Task 1.
- Persist through the existing `.from("teams").update(...).eq(...).eq(...).select(...).single()` chain.

- [ ] **Step 1: Update the test team fixture and write failing select/save assertions.**

  Add `division: null` to the fixture, assert the labeled select renders with `Unassigned`, select `Lunari`, submit, and assert the update payload contains `division: "Lunari"`; select `Unassigned` and assert `division: null`.

- [ ] **Step 2: Run the focused admin test and verify it fails because no division field/payload exists.**

  Run: `npx vitest run src/components/teams/AdminTeamEditor.test.tsx`

- [ ] **Step 3: Add division to form state and render the select.**

  Initialize from `team.division ?? ""`, render options for Unassigned/Lunari/Solari, and reset status on change.

- [ ] **Step 4: Include the normalized nullable value in the existing update payload.**

  Convert the empty select value to null and include it with name, abbreviation, captain, image, and banner color.

- [ ] **Step 5: Run the focused admin test and verify it passes.**

  Run: `npx vitest run src/components/teams/AdminTeamEditor.test.tsx`

### Task 4: Verify the complete feature

**Files:**
- Inspect: `src/app/teams/page.tsx`, all changed files, and git diff.

- [ ] **Step 1: Run the full Vitest suite.**

  Run: `npm test -- --run`

- [ ] **Step 2: Run lint.**

  Run: `npm run lint`

- [ ] **Step 3: Run the production build.**

  Run: `npm run build`

- [ ] **Step 4: Review the diff against the spec.**

  Confirm the migration is additive, all Team fixtures compile with the new property, empty sections are omitted, unassigned teams remain visible, and the suffix class is black.

- [ ] **Step 5: Attempt the normal commit and report the environment limitation if `.git/index` remains read-only.**

