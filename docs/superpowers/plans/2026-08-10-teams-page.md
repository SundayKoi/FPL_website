# Teams Page and Admin Roster Swaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/teams` roster directory with 12 placeholder preview cards, persisted admin-selected draft display, and admin-only same-position player swaps.

**Architecture:** Add a singleton `league_settings` record for the featured draft and a security-definer Supabase RPC that atomically swaps two non-captain players on matching roles. Render the page from a server component, keep roster cards presentational, and layer an admin client editor over the same cards for drag/drop and keyboard swaps. When no draft is featured, render typed read-only placeholder data.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 utilities, Supabase/Postgres/RLS/RPC, Vitest/Testing Library, pgTAP.

## Global Constraints

- Add `/teams` to the shared site header as a bookmarkable public route.
- The first release ships a typed preview dataset with 12 fictional teams, captains, and five fictional players per team.
- Placeholder cards are read-only; admin swaps become available as soon as an admin selects a persisted draft.
- Captains are immutable and same-position trade rules are enforced in the database and UI.
- Do not change auction behavior, draft-board permissions, or captain bidding rules.
- Preserve the existing `bg-hash`, `card-brand`, `label-dash`, display type, steel text, navy panels, line borders, and gold accent system.
- Do not add a dependency for drag/drop; use native browser drag/drop plus a keyboard alternative.
- Preserve the unrelated working-tree change in `next-env.d.ts`.

---

### Task 1: Add the featured-draft setting and atomic roster-swap RPC

**Files:**
- Create: `supabase/migrations/20260810000001_teams_featured.sql`
- Create: `supabase/tests/0010_teams_roster_swaps_test.sql`

**Interfaces:**
- Produces table `public.league_settings(id int primary key, featured_draft_id uuid null references public.drafts(id) on delete set null, updated_at timestamptz not null default now())`.
- Produces RPC `public.swap_roster_players(p_left_player_id uuid, p_right_player_id uuid) returns void`.
- Produces admin-only direct writes for `league_settings` and admin-only execution for `swap_roster_players`.

- [ ] **Step 1: Write the failing pgTAP assertions**

Create fixtures using the existing `supabase/tests/helpers/_fixtures.sql.inc` pattern. Assert that the migration creates `league_settings` and `swap_roster_players`, then cover:

```sql
select throws_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Captain 1'),
    (select id from public.players where display_name = 'Mid1')
  )$$,
  'NOT_ADMIN%',
  'captain cannot call the roster swap RPC'
);

select lives_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Mid2')
  )$$,
  'admin can swap same-role non-captains'
);

select is(
  (select team_id from public.players where display_name = 'Mid1'),
  (select id from public.teams where nomination_position = 2),
  'left player moves to right team'
);

select throws_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Captain 1'),
    (select id from public.players where display_name = 'Captain 2')
  )$$,
  'CAPTAIN_LOCKED%',
  'captain cannot move'
);

select throws_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Support1')
  )$$,
  'ROLE_MISMATCH%',
  'different roles cannot swap'
);

select throws_ok(
  $$select public.swap_roster_players(
    (select id from public.players where display_name = 'Mid1'),
    (select id from public.players where display_name = 'Mid2')
  )$$,
  'SAME_TEAM%',
  'players on one team cannot swap'
);
```

Also snapshot prices/acquisition before a successful swap and assert they are unchanged afterward. Wrap invalid calls in assertions that verify original `team_id` values remain unchanged.

- [ ] **Step 2: Run the focused database test to verify it fails**

Run: `./node_modules/.bin/supabase test db --local supabase/tests/0010_teams_roster_swaps_test.sql`

Expected: FAIL because the setting table and RPC do not exist.

- [ ] **Step 3: Implement the migration**

Create the singleton table, public-read/admin-write RLS policies, and grants. The RPC should:

```sql
perform public._require_admin();
select * into v_left from public.players where id = p_left_player_id for update;
select * into v_right from public.players where id = p_right_player_id for update;
if v_left.id is null or v_right.id is null then raise exception 'PLAYER_NOT_FOUND: player not found'; end if;
if v_left.team_id is null or v_right.team_id is null then raise exception 'PLAYER_UNASSIGNED: both players must be rostered'; end if;
if v_left.draft_id <> v_right.draft_id then raise exception 'DRAFT_MISMATCH: players must share a draft'; end if;
if v_left.team_id = v_right.team_id then raise exception 'SAME_TEAM: players must be on different teams'; end if;
if v_left.role <> v_right.role then raise exception 'ROLE_MISMATCH: players must share a role'; end if;
if v_left.acquisition = 'captain' or v_right.acquisition = 'captain' then raise exception 'CAPTAIN_LOCKED: captains cannot be traded'; end if;

update public.players set team_id = null, acquisition = null where id in (v_left.id, v_right.id);
update public.players set team_id = v_right.team_id, acquisition = v_left.acquisition where id = v_left.id;
update public.players set team_id = v_left.team_id, acquisition = v_right.acquisition where id = v_right.id;
```

Lock rows in deterministic ID order before reading their original team IDs, and grant `execute` only to `authenticated` because `_require_admin()` remains the authorization gate. Use the same `security definer set search_path = public` style as existing RPC migrations.

- [ ] **Step 4: Run the focused database test to verify it passes**

Run: `./node_modules/.bin/supabase test db --local supabase/tests/0010_teams_roster_swaps_test.sql`

Expected: PASS for table existence, admin selection writes, all valid/invalid swap cases, and unchanged price/acquisition fields.

- [ ] **Step 5: Commit the database slice**

```bash
git add supabase/migrations/20260810000001_teams_featured.sql supabase/tests/0010_teams_roster_swaps_test.sql
git commit -m "feat: add featured roster and admin swaps"
```

### Task 2: Create typed roster models and placeholder preview data

**Files:**
- Create: `src/components/teams/placeholderTeams.ts`
- Create: `src/components/teams/placeholderTeams.test.ts`
- Modify: `src/lib/draft/types.ts`

**Interfaces:**
- Produces `type RosterSlotView = { id: string; role: LolRole; displayName: string; price: number; acquisition: Acquisition }`.
- Produces `type RosterTeamView = { id: string; name: string; captainName: string; monogram: string; accentClass: string; pointsRemaining: number; players: RosterSlotView[] }`.
- Produces `const PLACEHOLDER_TEAMS: RosterTeamView[]` with exactly 12 complete fictional teams and five roles in `ROLE_ORDER` order.
- `Team` and `Player` remain the existing Supabase row types; add only view types that are not database rows.

- [ ] **Step 1: Write the failing placeholder-data tests**

Assert exact count, role order, unique team/player IDs, fictional captain/player names, and that each team has `top`, `jungle`, `mid`, `adc`, and `support` exactly once.

```tsx
it('contains twelve complete preview rosters', () => {
  expect(PLACEHOLDER_TEAMS).toHaveLength(12);
  for (const team of PLACEHOLDER_TEAMS) {
    expect(team.players.map((player) => player.role)).toEqual(ROLE_ORDER);
    expect(team.players.every((player) => player.acquisition !== 'captain')).toBe(false);
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/components/teams/placeholderTeams.test.ts`

Expected: FAIL because the view types and placeholder dataset do not exist.

- [ ] **Step 3: Implement the types and dataset**

Define the view types in `src/lib/draft/types.ts` and create 12 data objects with stable IDs, different monograms/accent classes, a captain slot represented by `acquisition: "captain"`, four additional fictional players, role-specific prices, and a nonnegative remaining budget. Keep the data presentation-only and do not import Supabase.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/components/teams/placeholderTeams.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the placeholder slice**

```bash
git add src/lib/draft/types.ts src/components/teams/placeholderTeams.ts src/components/teams/placeholderTeams.test.ts
git commit -m "feat: add teams roster view data"
```

### Task 3: Build the presentational roster cards and directory

**Files:**
- Create: `src/components/teams/TeamRosterCard.tsx`
- Create: `src/components/teams/TeamsDirectory.tsx`
- Create: `src/components/teams/TeamsDirectory.test.tsx`

**Interfaces:**
- `TeamRosterCard({ team, editable, onDragStart, onDrop, onKeyboardSwap })` renders a semantic `article` with one heading, captain metadata, five role rows, points, and budget.
- `TeamsDirectory({ draftName, teams, isPreview, isAdmin, children })` renders page title/supporting copy, preview/selected-draft status, responsive grid, and optional admin controls via `children`.

- [ ] **Step 1: Write the failing component tests**

Test the 12 placeholder cards, one heading per team, exact role labels `TOP`, `JG`, `MID`, `ADC`, `SUP`, captain labels, prices, budgets, `PREVIEW DATA`, and that a selected draft uses its supplied team data instead of placeholder data.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/components/teams/TeamsDirectory.test.tsx`

Expected: FAIL because the directory components do not exist.

- [ ] **Step 3: Implement the cards and directory**

Use `ROLE_ORDER` for stable slot order and a role-label map for `jungle -> JG` and `support -> SUP`. Use semantic table-like markup (`ul`/`li` with headers or a real table that remains responsive), visible lock treatment for captain rows, focus-visible outlines, and the existing utility classes. Put the team grid at `grid gap-5 md:grid-cols-2 xl:grid-cols-3`.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/components/teams/TeamsDirectory.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the presentation slice**

```bash
git add src/components/teams/TeamRosterCard.tsx src/components/teams/TeamsDirectory.tsx src/components/teams/TeamsDirectory.test.tsx
git commit -m "feat: add teams roster cards"
```

### Task 4: Add admin draft selection and roster swap interaction

**Files:**
- Create: `src/components/teams/FeaturedDraftSelector.tsx`
- Create: `src/components/teams/AdminRosterEditor.tsx`
- Create: `src/components/teams/AdminRosterEditor.test.tsx`

**Interfaces:**
- `FeaturedDraftSelector({ drafts, selectedDraftId, onSelected })` calls `supabase.from("league_settings").upsert({ id: 1, featured_draft_id })` and exposes a preview option.
- `AdminRosterEditor({ draftId, teams, players })` converts rows to `RosterTeamView` data, renders editable cards, calls `supabase.rpc("swap_roster_players", { p_left_player_id, p_right_player_id })`, and calls `router.refresh()` after success.

- [ ] **Step 1: Write the failing interaction tests**

Mock the Supabase client and router. Assert that:

- the selector is only rendered for admins by the parent route;
- selecting a draft upserts `{ id: 1, featured_draft_id: selectedId }`;
- captain rows have no draggable behavior and expose a locked label;
- same-role drop calls `swap_roster_players` with the two player IDs;
- different-role drop does not call the RPC and exposes a status message;
- RPC errors leave the current cards unchanged and expose the error message;
- keyboard `Swap with…` offers only other-team players with the same role.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/components/teams/AdminRosterEditor.test.tsx`

Expected: FAIL because the selector/editor components do not exist.

- [ ] **Step 3: Implement featured-draft persistence**

Use `createClient()` and an explicit pending/error state. Convert the preview option to `featured_draft_id: null`. After a successful upsert, call `router.refresh()` so the server route reloads the selected draft.

- [ ] **Step 4: Implement native drag/drop and keyboard fallback**

Track the dragged player ID in local state. On drag over, accept only a target player with the same `role`, a different `team_id`, and neither player with `acquisition === "captain"`. On drop, call the RPC with the stable source/target IDs. Render a visible `Swap with…` button for each non-captain row; its menu/listbox contains only valid same-role destinations. Keep the current roster until the RPC succeeds, then call `router.refresh()`.

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `npm test -- src/components/teams/AdminRosterEditor.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the admin interaction slice**

```bash
git add src/components/teams/FeaturedDraftSelector.tsx src/components/teams/AdminRosterEditor.tsx src/components/teams/AdminRosterEditor.test.tsx
git commit -m "feat: add admin roster editing"
```

### Task 5: Wire the `/teams` route and header

**Files:**
- Create: `src/app/teams/page.tsx`
- Create: `src/app/teams/page.test.tsx`
- Modify: `src/components/SiteNavigation.tsx`
- Modify: `src/components/SiteNavigation.test.tsx`

**Interfaces:**
- `TeamsPage` loads featured setting, available drafts for admins, selected draft/teams/players, and `profile.is_admin` through `createServerSupabase()`.
- The route passes `PLACEHOLDER_TEAMS` with `isPreview=true` when the setting is absent or null; otherwise it maps database rows into the roster-card view model and passes `isPreview=false`.

- [ ] **Step 1: Write the failing route/navigation tests**

Add the `/teams` exact link assertion to `SiteNavigation.test.tsx`. In the page test, mock `createServerSupabase()` and assert that the no-featured-draft branch renders 12 preview cards plus the selector for an admin, while the selected-draft branch renders the selected draft name and no preview label.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/components/SiteNavigation.test.tsx src/app/teams/page.test.tsx`

Expected: navigation fails because `/teams` is absent; page tests fail because the route is absent.

- [ ] **Step 3: Implement the route and header link**

Add `Teams` to the primary nav. In the page, fetch `league_settings` row `id=1`, then fetch admin drafts only when the authenticated profile is admin. Fetch the selected draft and its teams/players in parallel. Render the selector only for admins and render `AdminRosterEditor` only for an admin with a selected persisted draft. Keep the preview cards public and read-only.

- [ ] **Step 4: Run the focused tests to verify they pass**

Run: `npm test -- src/components/SiteNavigation.test.tsx src/app/teams/page.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the route slice**

```bash
git add src/app/teams/page.tsx src/app/teams/page.test.tsx src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx
git commit -m "feat: add public teams route"
```

### Task 6: Verify the complete feature and review the branch

**Files:**
- Modify only files required by verification findings.

**Interfaces:**
- The branch contains the complete `/teams` page, selector, swap UI, migration, tests, and documentation plan.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`

Expected: all existing and new Vitest tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0 and include `/teams` in the generated route output.

- [ ] **Step 4: Run Supabase tests when the local stack is available**

Run: `./node_modules/.bin/supabase test db --local supabase/tests`

Expected: existing pgTAP tests and the new roster-swap test pass. If the local stack is unavailable, report that exact environment limitation rather than changing the database test.

- [ ] **Step 5: Inspect the final diff and status**

Run: `git diff main...HEAD --stat; git diff main...HEAD --check; git status --short`

Expected: only the teams feature files and plan are committed; the unrelated `next-env.d.ts` modification remains uncommitted and untouched.

- [ ] **Step 6: Commit any verification fixes**

```bash
git add docs/superpowers/plans/2026-08-10-teams-page.md supabase/migrations/20260810000001_teams_featured.sql supabase/tests/0010_teams_roster_swaps_test.sql src/lib/draft/types.ts src/components/teams/placeholderTeams.ts src/components/teams/placeholderTeams.test.ts src/components/teams/TeamRosterCard.tsx src/components/teams/TeamsDirectory.tsx src/components/teams/TeamsDirectory.test.tsx src/components/teams/FeaturedDraftSelector.tsx src/components/teams/AdminRosterEditor.tsx src/components/teams/AdminRosterEditor.test.tsx src/app/teams/page.tsx src/app/teams/page.test.tsx src/components/SiteNavigation.tsx src/components/SiteNavigation.test.tsx
git commit -m "fix: address teams verification findings"
```
