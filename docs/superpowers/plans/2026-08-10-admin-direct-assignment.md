# Admin Direct Player Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Let admins assign an available player to a role-compatible team during a live or paused draft when no auction is open, charging an entered price and advancing the draft normally.

**Architecture:** Add a transactional admin_assign_player security-definer RPC that validates the draft, player, team, price, and auction state, then reuses _advance_turn. Add admin as an acquisition type. Expose the RPC through a focused AdminAssignmentPanel rendered inside the existing AdminStrip; Realtime remains the client state source of truth.

**Tech Stack:** Supabase/Postgres migrations and pgTAP, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library.

**Spec:** docs/superpowers/specs/2026-08-10-admin-direct-assignment-design.md (canonical).

## Global Constraints

- Admin assignments are available only when the draft is live or paused and has no open auction lot.
- The RPC is the authoritative mutation path; the browser never directly mutates player, team, or draft state for this feature.
- Assignments require a same-draft available player, a same-draft team with the player’s role open, and a nonnegative integer price no greater than the team’s remaining points.
- The assignment deducts the entered price, marks the player with acquisition admin, and advances the existing snake-order nomination helper.
- A failed request leaves player, team, and draft state unchanged.
- Captains and spectators cannot use the action; existing bidding, nomination, setup editing, roster swaps, and auction behavior remain unchanged.
- Preserve unrelated existing worktree changes; stage only files belonging to this feature in each commit.
- Verification gates: focused tests after each task, then npm test, npm run lint, npm run build, and npx supabase test db when local Supabase is available.

## File Structure

- Create: supabase/migrations/20260810000002_admin_direct_assignment.sql — add the admin acquisition enum value and the admin-only transactional RPC.
- Create: supabase/tests/0011_admin_direct_assignment_test.sql — pgTAP coverage for success, authorization, auction-state, validation, accounting, and turn progression.
- Create: supabase/migrations/20260810000003_admin_setup_assignment.sql — add the setup-only admin RPC for moving an existing pool player onto a team.
- Create: supabase/tests/0012_admin_setup_assignment_test.sql — pgTAP coverage for setup assignment, prefill limits, budget accounting, and validation.
- Modify: src/lib/draft/types.ts — add admin to the shared Acquisition union.
- Modify: src/components/draft/TeamColumn.tsx — show an ADM acquisition badge for direct placements.
- Create: src/components/draft/AdminAssignmentPanel.tsx — admin-only form for selecting an available player, compatible team, and price.
- Create: src/components/draft/AdminAssignmentPanel.test.tsx — component-level visibility, filtering, submission, and error tests.
- Modify: src/components/admin/TeamEditor.tsx — add an existing-player setup form with a point-value input.
- Create: src/components/admin/TeamEditor.test.tsx — test existing-player setup selection, pricing, RPC submission, and preservation of the new-player form.
- Modify: src/components/draft/AdminStrip.tsx — accept current teams and players and render the assignment panel alongside existing admin actions.
- Modify: src/components/draft/DraftBoard.tsx — pass current teams and players into AdminStrip.
- Modify: src/components/draft/Toast.tsx — map new assignment RPC error codes to safe user-facing messages.

---

### Task 1: Add the database contract and prove it with pgTAP

Files:
- Create: supabase/tests/0011_admin_direct_assignment_test.sql
- Create: supabase/migrations/20260810000002_admin_direct_assignment.sql

Interfaces:
- Consumes: public._require_admin(), public.open_roles(uuid), and public._advance_turn(public.drafts) from existing migrations.
- Produces: public.admin_assign_player(p_draft_id uuid, p_player_id uuid, p_team_id uuid, p_price int) returns void; new enum value public.acquisition_type = 'admin'.

- [ ] Step 1: Write the failing pgTAP test for a successful assignment

Create a fixture draft, move it live, identify Team A and Mid1, then act as the admin and assert the desired transaction:

~~~sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as team_b,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12
) $$, 'admin assigns an available player');
select is((select team_id from public.players where id = (select mid1 from ids)),
          (select team_a from ids), 'player is assigned to selected team');
select is((select price from public.players where id = (select mid1 from ids)), 12,
          'entered price is stored');
select is((select acquisition::text from public.players where id = (select mid1 from ids)), 'admin',
          'assignment is marked as admin acquisition');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 88,
          'team points are deducted');
select is((select current_nominator_team_id from public.drafts where id = (select d from t)),
          (select team_b from ids), 'normal nomination turn advancement is used');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_assign_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 1
) $$, 'NOT_ADMIN%', 'captain cannot assign directly');

select * from finish();
rollback;
~~~

- [ ] Step 2: Run the new database test to verify it fails

Run: npx supabase test db --file supabase/tests/0011_admin_direct_assignment_test.sql

Expected: FAIL because public.admin_assign_player does not exist yet. If the local Supabase stack is unavailable, record that environment limitation and continue with the same test-first order.

- [ ] Step 3: Add the enum value and minimal transactional RPC

Create the migration with this core shape:

~~~sql
alter type public.acquisition_type add value if not exists 'admin';

create function public.admin_assign_player(
  p_draft_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_price int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
begin
  perform public._require_admin();

  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;
  if v_draft.status not in ('live', 'paused') then
    raise exception 'DRAFT_INVALID: draft is not active';
  end if;
  if exists (select 1 from public.lots where draft_id = p_draft_id and status = 'open') then
    raise exception 'LOT_OPEN_EXISTS: an auction is already running';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID: price must be a nonnegative integer';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'PLAYER_INVALID: player is not in this draft';
  end if;
  if v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player is already taken';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  if not (v_player.role = any (public.open_roles(v_team.id))) then
    raise exception 'ROLE_FILLED: team already has that role filled';
  end if;
  if p_price > v_team.points_remaining then
    raise exception 'INSUFFICIENT_POINTS: price exceeds team points';
  end if;

  update public.players
    set team_id = v_team.id, price = p_price, acquisition = 'admin'
    where id = v_player.id;
  update public.teams
    set points_remaining = points_remaining - p_price
    where id = v_team.id;

  select * into v_draft from public.drafts where id = p_draft_id;
  perform public._advance_turn(v_draft);
end $$;
~~~

Keep the explicit same-draft filters and draft row lock. The existing players_one_per_role index and player check constraint are the final database invariants.

- [ ] Step 4: Run the focused database test to verify it passes

Run: npx supabase db reset && npx supabase test db --file supabase/tests/0011_admin_direct_assignment_test.sql

Expected: PASS for all assertions. If enum migration ordering or the local CLI’s file filter differs, run npx supabase test db and confirm the new test passes in the complete suite.

- [ ] Step 5: Add validation and atomicity cases before committing

Extend 0011_admin_direct_assignment_test.sql with these independent assertions:

Before adding the assertions below, change the pgTAP plan from 7 to 15. Run the wrong-draft, wrong-team, rostered-player, role-filled, and insufficient-points assertions before creating the open lot; the open-lot assertion must be last because the RPC intentionally rejects every assignment while that lot exists.

~~~sql
select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 999
) $$, 'INSUFFICIENT_POINTS%', 'overspending is rejected');
select ok((select team_id is null and price is null from public.players
           where draft_id = (select d from t) and display_name = 'Mid2'),
          'failed assignment leaves player unchanged');

~~~

Also assert wrong-draft player/team IDs, already-rostered players, and a final assignment that causes the normal _advance_turn path to set the draft complete. Use a separate temporary fixture state for the completion case so the success and failure assertions do not depend on one another.

Use explicit cases rather than broad table-state checks:

~~~sql
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  gen_random_uuid(),
  (select team_a from ids), 1
) $$, 'PLAYER_INVALID%', 'player from another draft is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select mid1 from ids),
  gen_random_uuid(), 1
) $$, 'TEAM_INVALID%', 'team from another draft is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Captain 1'),
  (select team_a from ids), 1
) $$, 'PLAYER_TAKEN%', 'rostered player is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1
) $$, 'ROLE_FILLED%', 'filled role is rejected');

create temporary table completion as select tests.fixture() as d;
select tests.go_live((select d from completion));
select tests.acting_as(tests.admin_id());
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select is((select status::text from public.drafts where id = (select d from completion)), 'complete', 'last assignment completes draft');
~~~

Finally, append the open-lot case after the other validation cases:

~~~sql
select tests.acting_as(tests.cap(2));
select public.nominate((select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'));
select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid3'),
  (select team_a from ids), 1
) $$, 'LOT_OPEN_EXISTS%', 'open auction blocks direct assignment');
~~~

- [ ] Step 6: Run the complete database suite and commit the database change

Run: npx supabase db reset && npx supabase test db

Expected: all pgTAP tests pass, including existing auction/admin override coverage.

~~~bash
git add supabase/migrations/20260810000002_admin_direct_assignment.sql supabase/tests/0011_admin_direct_assignment_test.sql
git commit -m "feat: add admin direct assignment RPC"
~~~

### Task 2: Add the pre-draft setup assignment RPC

Files:
- Create: supabase/tests/0012_admin_setup_assignment_test.sql
- Create: supabase/migrations/20260810000003_admin_setup_assignment.sql

Interfaces:
- Consumes: public._require_admin(), public.open_roles(uuid), and the existing setup schema constraints.
- Produces: public.admin_assign_setup_player(p_draft_id uuid, p_player_id uuid, p_team_id uuid, p_price int) returns void.

- [ ] Step 1: Write the failing pgTAP test

Use the shared fixture, remove Team A’s existing free-agency prefill to create one setup slot, then prove that an admin can move an existing pool player into that slot at a selected price:

~~~sql
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

create temporary table t as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 1';
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12
) $$, 'admin assigns an existing pool player during setup');
select is((select team_id from public.players where id = (select mid1 from ids)),
          (select team_a from ids), 'setup player is assigned to the selected team');
select is((select price from public.players where id = (select mid1 from ids)), 12,
          'setup point value is stored');
select is((select acquisition::text from public.players where id = (select mid1 from ids)), 'free_agency',
          'setup assignment is marked free agency');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 88,
          'setup assignment deducts team points');
select is((select status::text from public.drafts where id = (select d from t)), 'setup',
          'setup assignment does not change draft status');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1
) $$, 'NOT_ADMIN%', 'captain cannot assign during setup');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), gen_random_uuid(), (select team_a from ids), 1
) $$, 'PLAYER_INVALID%', 'wrong-draft player is rejected');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1
) $$, 'SETUP_FULL%', 'full prefill team is rejected');
select ok((select team_id is null and price is null from public.players
           where draft_id = (select d from t) and display_name = 'Mid2'),
          'failed setup assignment leaves player in the pool');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Adc2'),
  (select id from public.teams where draft_id = (select d from t) and nomination_position = 2),
  999
) $$, 'INSUFFICIENT_POINTS%', 'insufficient setup points are rejected');

select * from finish();
rollback;
~~~

- [ ] Step 2: Run the focused database test to verify it fails

Run: npx supabase test db --file supabase/tests/0012_admin_setup_assignment_test.sql

Expected: FAIL because public.admin_assign_setup_player does not exist yet.

- [ ] Step 3: Add the setup-only transactional RPC

Create the migration with this behavior:

~~~sql
create function public.admin_assign_setup_player(
  p_draft_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_price int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID: price must be a nonnegative integer';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'PLAYER_INVALID: player is not in this draft';
  end if;
  if v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player is already assigned';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  if (select count(*) from public.players where team_id = v_team.id) >= 2 then
    raise exception 'SETUP_FULL: team already has two pre-filled players';
  end if;
  if not (v_player.role = any (public.open_roles(v_team.id))) then
    raise exception 'ROLE_FILLED: team already has that role filled';
  end if;
  if p_price > v_team.points_remaining then
    raise exception 'INSUFFICIENT_POINTS: price exceeds team points';
  end if;

  update public.players
    set team_id = v_team.id, price = p_price, acquisition = 'free_agency'
    where id = v_player.id;
  update public.teams
    set points_remaining = points_remaining - p_price
    where id = v_team.id;
end $$;
~~~

The RPC must not call _advance_turn. Keep same-draft filters, row locks, and the existing one-player-per-role/check constraints authoritative.

- [ ] Step 4: Run the focused and complete database tests

Run: npx supabase db reset && npx supabase test db

Expected: all pgTAP tests pass, including the new setup assignment test and existing setup lifecycle tests.

- [ ] Step 5: Commit the setup RPC

~~~bash
git add supabase/migrations/20260810000003_admin_setup_assignment.sql supabase/tests/0012_admin_setup_assignment_test.sql
git commit -m "feat: add admin setup player assignment RPC"
~~~

### Task 3: Add the shared acquisition type and admin roster badge

Files:
- Modify: src/lib/draft/types.ts
- Modify: src/components/draft/TeamColumn.tsx
- Create: src/components/draft/TeamColumn.test.tsx

Interfaces:
- Consumes: database rows with acquisition = 'admin'.
- Produces: TypeScript-compatible admin acquisition data and an ADM badge in the existing team-column roster slot.

- [ ] Step 1: Write the failing badge test

~~~tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TeamColumn from "./TeamColumn";

describe("TeamColumn", () => {
  it("labels a directly assigned player with the admin badge", () => {
    render(<TeamColumn
      team={{ id: "team-1", draft_id: "draft-1", name: "Team A", captain_profile_id: null,
        nomination_position: 1, budget_start: 100, points_remaining: 88 }}
      players={[{ id: "player-1", draft_id: "draft-1", display_name: "Mid One", role: "mid",
        rank: null, opgg_url: null, notes: null, team_id: "team-1", price: 12, acquisition: "admin" }]}
      isNominator={false}
      isMyTeam={false}
    />);
    expect(screen.getByText("ADM")).toBeTruthy();
  });
});
~~~

- [ ] Step 2: Run the focused test to verify it fails

Run: npx vitest run src/components/draft/TeamColumn.test.tsx

Expected: FAIL because admin is not yet in Acquisition and no badge is mapped.

- [ ] Step 3: Add the type and badge

Change the union and badge map:

~~~ts
export type Acquisition = "captain" | "free_agency" | "auction" | "admin";
~~~

~~~ts
const ACQ_BADGE: Record<string, string> = {
  captain: "C",
  free_agency: "FA",
  admin: "ADM",
};
~~~

- [ ] Step 4: Run focused and existing type-consuming tests

Run: npx vitest run src/components/draft/TeamColumn.test.tsx src/components/teams src/app/teams/page.test.tsx

Expected: PASS with no regressions to captain, free-agency, auction, or roster rendering.

- [ ] Step 5: Commit the shared type/display change

~~~bash
git add src/lib/draft/types.ts src/components/draft/TeamColumn.tsx src/components/draft/TeamColumn.test.tsx
git commit -m "feat: label admin draft assignments"
~~~

### Task 4: Build the admin assignment form with test-first behavior

Files:
- Create: src/components/draft/AdminAssignmentPanel.test.tsx
- Create: src/components/draft/AdminAssignmentPanel.tsx

Interfaces:
- Consumes: Draft, Team[], Player[], Lot | null, and the existing onError callback.
- Produces: AdminAssignmentPanel({ draft, teams, players, openLot, onError }), which renders nothing during an open auction or inactive draft and otherwise calls admin_assign_player with { p_draft_id, p_player_id, p_team_id, p_price }.

- [ ] Step 1: Write the failing visibility/filter/submission tests

Use a hoisted rpc mock returning { error: null }, mock @/lib/supabase/client, and mock window.confirm to return true. Cover these behaviors:

~~~tsx
it("hides the assignment panel while an auction is open", () => {
  render(<AdminAssignmentPanel {...props} openLot={{ id: "lot-1", status: "open" } as never} />);
  expect(screen.queryByRole("heading", { name: /direct assignment/i })).toBeNull();
});

it("offers only available players and teams with the selected role open", () => {
  render(<AdminAssignmentPanel {...props} openLot={null} />);
  expect(screen.getByRole("option", { name: "Mid One" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Sold Mid" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
  expect(screen.getByRole("option", { name: "Team A" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Team B" })).toBeNull();
});

it("submits the selected player, team, and price", async () => {
  render(<AdminAssignmentPanel {...props} openLot={null} />);
  fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
  fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-a" } });
  fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: /assign player/i }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_assign_player", {
    p_draft_id: "draft-1", p_player_id: "mid-1", p_team_id: "team-a", p_price: 12,
  }));
});
~~~

Also assert that a returned error calls onError with friendly(errCode(error)) and that invalid local selections do not call the RPC.

- [ ] Step 2: Run the focused tests to verify they fail

Run: npx vitest run src/components/draft/AdminAssignmentPanel.test.tsx

Expected: FAIL because the component does not exist.

- [ ] Step 3: Implement the minimal form

Use explicit derived lists rather than duplicating database rules:

~~~tsx
const availablePlayers = players.filter((player) => player.team_id === null);
const selectedPlayer = availablePlayers.find((player) => player.id === playerId) ?? null;
const eligibleTeams = selectedPlayer
  ? teams.filter((team) => !players.some((player) =>
      player.team_id === team.id && player.role === selectedPlayer.role))
  : [];
~~~

Return null unless the draft status is live or paused and no openLot exists. Render labeled player, team, and nonnegative integer price controls. Reset the team selection when the player changes, require all selections, confirm with the player/team/price summary, call the RPC, route errors through onError, and clear/reset the form only after a successful response. Keep all authoritative validation in the RPC.

- [ ] Step 4: Run the focused tests to verify they pass

Run: npx vitest run src/components/draft/AdminAssignmentPanel.test.tsx

Expected: PASS for hidden/open-lot behavior, role-compatible filtering, successful RPC payload, and friendly error handling.

- [ ] Step 5: Commit the focused assignment component

~~~bash
git add src/components/draft/AdminAssignmentPanel.tsx src/components/draft/AdminAssignmentPanel.test.tsx
git commit -m "feat: add admin draft assignment form"
~~~

### Task 5: Integrate the form into the draft board and friendly errors

Files:
- Modify: src/components/draft/AdminStrip.tsx
- Modify: src/components/draft/DraftBoard.tsx
- Modify: src/components/draft/Toast.tsx

Interfaces:
- Consumes: AdminAssignmentPanel from Task 4, current teams/players from DraftBoard, and existing openLot state.
- Produces: admin board controls that show direct assignment only when allowed, while preserving every existing pause/resume, undo, cancel, force-close, and countdown control.

- [ ] Step 1: Update the admin strip contract

Change AdminStrip props to include teams: Team[] and players: Player[], then render the panel with the existing draft/openLot/onError values. Keep the existing run helper and controls unchanged.

- [ ] Step 2: Pass live board state into the admin strip

Update the existing render site in DraftBoard.tsx:

~~~tsx
{s.isAdmin && (
  <AdminStrip
    draft={draft}
    teams={teams}
    players={players}
    openLot={openLot}
    onError={setToast}
  />
)}
~~~

- [ ] Step 3: Add safe user-facing messages for new RPC codes

Extend FRIENDLY in Toast.tsx with:

~~~ts
DRAFT_INVALID: "Direct assignment is unavailable for this draft.",
PLAYER_INVALID: "That player is not available in this draft.",
TEAM_INVALID: "That team is not available in this draft.",
PRICE_INVALID: "Enter a nonnegative whole-number price.",
INSUFFICIENT_POINTS: "That team does not have enough points.",
~~~

Keep LOT_OPEN_EXISTS, PLAYER_TAKEN, ROLE_FILLED, and NOT_ADMIN mappings intact.

- [ ] Step 4: Run the focused UI suite

Run: npx vitest run src/components/draft/AdminAssignmentPanel.test.tsx src/components/draft/DraftBoard.test.tsx src/components/draft/BidControls.test.tsx

Expected: PASS; the board still renders its missing-draft states and existing bid controls, and the assignment form is reachable through the admin strip without changing captain/spectator behavior.

- [ ] Step 5: Commit the integration

~~~bash
git add src/components/draft/AdminStrip.tsx src/components/draft/DraftBoard.tsx src/components/draft/Toast.tsx
git commit -m "feat: expose admin assignments on draft board"
~~~

### Task 6: Add existing-player pricing to the pre-draft setup UI

Files:
- Modify: src/components/admin/TeamEditor.tsx
- Create: src/components/admin/TeamEditor.test.tsx

Interfaces:
- Consumes: the setup RPC from Task 2, the current draft players passed through TeamEditor, and existing TeamEditor refetch behavior.
- Produces: an Existing player selector and Point value input in each team’s pre-filled-player section, while preserving the existing add-by-name form.

- [ ] Step 1: Write the failing TeamEditor tests

Mock the Supabase client with a chainable from method for the existing render path and an rpc spy for the new setup mutation. Render a setup draft with one team, one existing unassigned Mid player, and one prefilled Top player. Cover:

~~~tsx
it("offers an existing pool player with a point value field", () => {
  render(<TeamEditor {...props} />);
  expect(screen.getByRole("option", { name: "Mid One · mid" })).toBeTruthy();
  expect(screen.getByLabelText("Point value")).toBeTruthy();
  expect(screen.getByPlaceholderText("Player name")).toBeTruthy();
});

it("assigns the selected existing player at the entered point value", async () => {
  render(<TeamEditor {...props} />);
  fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "mid-1" } });
  fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "12" } });
  fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("admin_assign_setup_player", {
    p_draft_id: "draft-1", p_player_id: "mid-1", p_team_id: "team-a", p_price: 12,
  }));
  expect(onChanged).toHaveBeenCalled();
});
~~~

Also assert the existing Player name field and Add button remain rendered for new-player creation, and that no existing-player form is offered when a team already has two prefills.

- [ ] Step 2: Run the focused tests to verify they fail

Run: npx vitest run src/components/admin/TeamEditor.test.tsx

Expected: FAIL because the existing-player setup form does not exist.

- [ ] Step 3: Add the existing-player setup form

Add an addExistingPrefill handler that calls admin_assign_setup_player with the draft, player, team, and numeric price. Use the existing team players to derive available pool players and preserve the two-prefill limit. Filter the options so a team cannot select an available player whose role is already used by that team. On RPC error, set the existing TeamEditor error state; on success, call onChanged. Do not change addPrefill’s name/role behavior.

Render the new form next to or below PrefillForm with labels Existing player and Point value, a nonnegative integer number input, and an Add existing player submit button. Disable it when busy, no eligible pool players exist, or the team already has two prefills.

- [ ] Step 4: Run the focused tests to verify they pass

Run: npx vitest run src/components/admin/TeamEditor.test.tsx

Expected: PASS for existing-player selection, point-value RPC payload, refetch, preservation of new-player creation, and the two-prefill limit.

- [ ] Step 5: Commit the setup UI

~~~bash
git add src/components/admin/TeamEditor.tsx src/components/admin/TeamEditor.test.tsx
git commit -m "feat: price existing setup player assignments"
~~~

### Task 7: Run full verification and inspect the final diff

Files:
- No new files; verify all feature files from Tasks 1–6.

Interfaces:
- Consumes: the complete admin direct-assignment implementation.
- Produces: verified working tree with no feature regressions and unrelated edits left untouched.

- [ ] Step 1: Run the full TypeScript/component test suite

Run: npm test

Expected: all Vitest tests pass with no warnings or unhandled errors.

- [ ] Step 2: Run lint and production build

Run: npm run lint && npm run build

Expected: both commands exit 0. In particular, verify no React hook lint errors are introduced by the assignment form.

- [ ] Step 3: Run the full database suite when Supabase is available

Run: npx supabase db reset && npx supabase test db

Expected: all pgTAP tests pass, including the new admin assignment coverage and existing lifecycle/auction/roster-swap tests. If Docker/Supabase is unavailable, report that exact limitation rather than claiming database verification.

- [ ] Step 4: Inspect the diff and working tree

Run:

~~~bash
git diff --check
git status --short
git diff HEAD~6 -- supabase src/components/admin src/components/draft src/lib/draft/types.ts
~~~

Confirm the feature commits contain only intended files and that the pre-existing info-page edits and untracked CSV remain untouched.

- [ ] Step 5: Perform a manual draft-board smoke check

With the local app and Supabase running, open an admin draft with no open lot and verify the panel shows an available player, compatible teams, price input, and submit confirmation. Start an auction and verify the panel disappears. Submit a valid assignment and verify the player, ADM badge, deducted budget, and next nominator update from Realtime. Leave the existing open-lot controls and captain bid controls unchanged.

- [ ] Step 6: Commit any verification-only corrections

If verification requires a code correction, rerun the relevant focused test and then full gates before committing:

~~~bash
git add supabase src/components/admin src/components/draft src/lib/draft/types.ts
git commit -m "fix: verify admin direct assignment flow"
~~~
