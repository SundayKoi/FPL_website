# Setup Acquisition Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Captain and Free Agency setup players selectable from the existing pool, price both assignments, persist distinct acquisition types, and remove free-form player-name entry.

**Architecture:** Replace the two setup-player forms with one existing-player assignment form that sends an explicit `p_acquisition` and `p_price` to a setup RPC. Replace the old four-argument RPC with a five-argument, admin-gated function that validates one Captain and one Free Agency assignment per team, assigns the existing player, and deducts the entered price. Preserve the existing `Player.acquisition` type and update roster presentation to show `C` versus `FA`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL migrations and pgTAP tests, Vitest, Testing Library, ESLint.

## Global Constraints

- Use only existing `captain` and `free_agency` acquisition enum values; do not change auction or live admin assignment behavior.
- Every setup player must come from the existing player pool; remove the free-form `Player name` input.
- Both Captain and Free Agency setup players require a nonnegative integer point value and deduct that value from `teams.points_remaining`.
- The database RPC is authoritative for stale props and concurrent admins; client disabled states are convenience only.
- Preserve form values after RPC errors and reset the form only after a successful assignment.
- Follow the local Next.js App Router conventions documented in `node_modules/next/dist/docs/01-app/index.md`.
- Use TDD: write each focused failing test, run it to observe the intended failure, then implement the smallest change and rerun the test.

---

## File map

- Create `supabase/migrations/20260810000006_setup_acquisition_types.sql`: replace the setup-assignment RPC signature and add acquisition-type validation.
- Modify `supabase/tests/0012_admin_setup_assignment_test.sql`: pass the explicit acquisition argument to existing calls and assert both setup price/acquisition paths.
- Modify `supabase/tests/0013_admin_setup_management_test.sql`: pass the explicit acquisition argument to management fixtures.
- Create `supabase/tests/0016_setup_acquisition_types_test.sql`: cover Captain pricing, Free Agency pricing, duplicate acquisition rejection, invalid acquisition rejection, and no-mutation behavior.
- Modify `src/components/admin/TeamEditor.tsx`: remove free-form insertion and make the existing-player form choose acquisition type and price.
- Modify `src/components/admin/TeamEditor.test.tsx`: cover the new form contract, both acquisition values, duplicate-type filtering, error retention, and removal of the name input.
- Modify `src/components/teams/TeamRosterCard.tsx`: render `FA` for Free Agency rows while keeping Captain rows locked.
- Modify `src/components/teams/TeamRosterCard.test.tsx`: assert the Free Agency badge and that only Captain rows are locked.
- Modify `src/lib/draft/types.ts` only if a shared form type is needed; prefer the existing `Acquisition` union without changing it.

## Task 1: Replace the setup assignment RPC with an explicit acquisition contract

**Files:**
- Create: `supabase/migrations/20260810000006_setup_acquisition_types.sql`
- Modify: `supabase/tests/0012_admin_setup_assignment_test.sql`
- Modify: `supabase/tests/0013_admin_setup_management_test.sql`
- Create: `supabase/tests/0016_setup_acquisition_types_test.sql`

**Interfaces:**
- Produces `public.admin_assign_setup_player(uuid, uuid, uuid, int, public.acquisition_type)` returning `void`.
- Accepts `p_acquisition` values `captain` and `free_agency` only.
- Raises `SETUP_ACQUISITION_INVALID` for any other setup acquisition and `SETUP_ACQUISITION_TAKEN` when that acquisition already exists on the team.

- [ ] **Step 1: Add failing SQL assertions for Captain pricing and duplicate acquisition.**

Create a focused pgTAP fixture that acts as the admin, selects a pool player and team, then calls:

```sql
select public.admin_assign_setup_player(
  (select d from t),
  (select captain_candidate from ids),
  (select team_a from ids),
  15,
  'captain'
);
```

Assert `acquisition::text = 'captain'`, `price = 15`, and that the team’s points dropped by 15. Attempt a second Captain assignment and assert `throws_like(..., 'SETUP_ACQUISITION_TAKEN%')`, with the second player unassigned and the team budget unchanged.

- [ ] **Step 2: Run the focused Supabase test and verify the expected failure.**

Run:

```bash
supabase test db --file supabase/tests/0016_setup_acquisition_types_test.sql
```

Expected: FAIL because the current schema exposes only `admin_assign_setup_player(uuid, uuid, uuid, int)`.

- [ ] **Step 3: Create the migration with the new function signature and validation.**

Drop the old signature, create the five-argument function, and grant only the new signature to `authenticated` and `service_role`. Keep the existing setup, draft, player, team, role, full-team, and insufficient-points checks, then add:

```sql
if p_acquisition not in ('captain', 'free_agency') then
  raise exception 'SETUP_ACQUISITION_INVALID: setup acquisition must be captain or free_agency';
end if;
if exists (
  select 1 from public.players
  where team_id = v_team.id and acquisition = p_acquisition
) then
  raise exception 'SETUP_ACQUISITION_TAKEN: team already has this setup acquisition';
end if;
```

Update the player with `acquisition = p_acquisition` and the entered price, and subtract `p_price` for both acquisition types. Revoke the old four-argument signature before dropping it.

- [ ] **Step 4: Update existing SQL callers with explicit acquisition values.**

Use `'free_agency'` for existing-pool assignment cases that already assert Free Agency. Use `'captain'` where a test intentionally creates a Captain setup assignment. Update privilege assertions to reference the five-argument signature.

- [ ] **Step 5: Add remaining database regression cases.**

In `0016_setup_acquisition_types_test.sql`, assert a priced Free Agency assignment, an invalid `'auction'` rejection, duplicate type rejection, no mutation after each failure, and removal/refund behavior for both types. Use assertions shaped like:

```sql
select lives_ok($$ select public.admin_assign_setup_player(..., 20, 'free_agency') $$,
  'admin assigns a priced free agency setup player');
select is((select acquisition::text from public.players where id = ...), 'free_agency',
  'free agency acquisition is persisted');
select throws_like($$ select public.admin_assign_setup_player(..., 5, 'auction') $$,
  'SETUP_ACQUISITION_INVALID%', 'auction is rejected during setup');
```

- [ ] **Step 6: Run the complete database test suite.**

```bash
supabase test db
```

Expected: all SQL tests pass, including existing setup management, lifecycle, roster swap, and direct assignment tests.

- [ ] **Step 7: Commit the database change.**

```bash
git add supabase/migrations/20260810000006_setup_acquisition_types.sql supabase/tests/0012_admin_setup_assignment_test.sql supabase/tests/0013_admin_setup_management_test.sql supabase/tests/0016_setup_acquisition_types_test.sql
git commit -m "fix: distinguish setup acquisition types"
```

## Task 2: Replace the free-form setup form with typed existing-player assignment

**Files:**
- Modify: `src/components/admin/TeamEditor.tsx`
- Modify: `src/components/admin/TeamEditor.test.tsx`

**Interfaces:**
- `ExistingPrefillForm` accepts `players: Player[]`, `acquisitions: Acquisition[]`, `disabled: boolean`, and `onAdd(playerId: string, acquisition: Acquisition, price: number): Promise<boolean>`.
- The RPC payload is:

```ts
supabase.rpc("admin_assign_setup_player", {
  p_draft_id: draftId,
  p_player_id: playerId,
  p_team_id: team.id,
  p_price: price,
  p_acquisition: acquisition,
});
```

- [ ] **Step 1: Write failing component tests for the new controls.**

Use at least two unassigned pool players and no setup player, then assert:

```ts
expect(screen.queryByPlaceholderText("Player name")).toBeNull();
expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
expect(screen.getByLabelText("Acquisition")).toBeTruthy();
expect(screen.getByRole("option", { name: "Captain" })).toBeTruthy();
expect(screen.getByRole("option", { name: "Free Agency" })).toBeTruthy();
```

Add one test selecting Captain with price `15` and one selecting Free Agency with price `12`; each asserts the five-argument RPC payload and `onChanged`. Add a test with a Captain already assigned that expects only Free Agency in the acquisition selector. Update the error test to assert player, acquisition, and price are retained.

- [ ] **Step 2: Run the TeamEditor tests and verify the expected failure.**

```bash
npm test -- src/components/admin/TeamEditor.test.tsx
```

Expected: FAIL because `PrefillForm` still renders the free-form name field and the existing-player form has no acquisition control or five-argument payload.

- [ ] **Step 3: Implement the minimal form/data-flow change.**

In `TeamEditor`, import `type Acquisition`, delete `addPrefill` and `PrefillForm`, derive:

```ts
const setupAcquisitions: Acquisition[] = ["captain", "free_agency"];
const availableAcquisitions = setupAcquisitions.filter(
  (acquisition) => !prefills.some((player) => player.acquisition === acquisition),
);
```

Render one `ExistingPrefillForm` with `players={availablePoolPlayers}` and `acquisitions={availableAcquisitions}`. Add the acquisition selector and always-visible nonnegative point input. Pass `p_acquisition` to the RPC. Reset player, acquisition, and price only after success; preserve all three after failure. Disable the form when there are no eligible players or no acquisition types. Update the local acquisition default when a successful refetch removes the selected type.

- [ ] **Step 4: Run the focused component tests and verify they pass.**

```bash
npm test -- src/components/admin/TeamEditor.test.tsx
```

Expected: all TeamEditor tests pass and no `Player name` input is rendered.

- [ ] **Step 5: Commit the setup editor change.**

```bash
git add src/components/admin/TeamEditor.tsx src/components/admin/TeamEditor.test.tsx
git commit -m "fix: use typed existing players for setup"
```

## Task 3: Show Free Agency distinctly in roster cards

**Files:**
- Modify: `src/components/teams/TeamRosterCard.tsx`
- Modify: `src/components/teams/TeamRosterCard.test.tsx`

**Interfaces:**
- Preserve `RosterSlotView.acquisition` and the existing swap callbacks.
- Captain rows remain non-draggable and show `C`; Free Agency rows show `FA` and remain eligible for swaps.

- [ ] **Step 1: Write the failing roster-card test.**

Render a team containing a Captain and a Free Agency player and assert:

```ts
expect(screen.getByText("C")).toBeTruthy();
expect(screen.getByText("FA")).toBeTruthy();
expect(captainRow.getAttribute("draggable")).toBe("false");
expect(freeAgencyRow.getAttribute("draggable")).toBe("true");
```

- [ ] **Step 2: Run the focused test and verify the expected failure.**

```bash
npm test -- src/components/teams/TeamRosterCard.test.tsx
```

Expected: FAIL because the current card renders a `C` badge only.

- [ ] **Step 3: Add the Free Agency badge without changing swap rules.**

Render the existing badge style with `FA` when `player.acquisition === "free_agency"`. Keep Captain as the only condition that disables dragging, drop handling, and keyboard swapping.

- [ ] **Step 4: Run focused roster tests.**

```bash
npm test -- src/components/teams/TeamRosterCard.test.tsx src/components/teams/AdminRosterEditor.test.tsx src/lib/teams/roster.test.ts
```

Expected: all pass; Captain identification remains acquisition-based and Free Agency is not locked.

- [ ] **Step 5: Commit the roster presentation change.**

```bash
git add src/components/teams/TeamRosterCard.tsx src/components/teams/TeamRosterCard.test.tsx
git commit -m "fix: label free agency roster players"
```

## Task 4: Full verification and requirement audit

**Files:** No new production files; inspect the completed diff and test output.

- [ ] **Step 1: Run the full Vitest suite.**

```bash
npm test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 2: Run ESLint.**

```bash
npm run lint
```

Expected: exit code 0 with no errors.

- [ ] **Step 3: Run the production build.**

```bash
npm run build
```

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 4: Run the database suite if the local Supabase environment is available.**

```bash
supabase test db
```

Expected: all database tests pass. If the environment is unavailable, report that limitation explicitly.

- [ ] **Step 5: Audit the final diff against the spec.**

```bash
git diff --check HEAD~3..HEAD
git status --short
git diff --stat HEAD~3..HEAD
```

Confirm the implementation removes free-form player-name entry, sends explicit Captain/Free Agency values, prices and deducts both types, rejects duplicate setup types server-side, shows `C` versus `FA`, and leaves auction/live assignment behavior unchanged.

- [ ] **Step 6: Commit any verification-only correction only after returning to a failing-test-first cycle.**

Do not claim completion until fresh test, lint, build, and database evidence is available.
