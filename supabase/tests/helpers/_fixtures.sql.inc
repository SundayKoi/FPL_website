-- Shared test helpers. Include from tests with:  \ir helpers/_fixtures.sql.inc
-- (named .sql.inc, not .sql: `supabase test db` globs *.sql recursively under
-- tests/ and would run this file itself as a planless pg_prove test otherwise)
-- Everything lives in a "tests" schema created inside the test transaction.
create schema if not exists tests;

create or replace function tests.cap(n int) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid
$$;

create or replace function tests.admin_id() returns uuid language sql immutable as $$
  select '00000000-0000-0000-0000-000000000099'::uuid
$$;

-- A plain admin_id() profile is not an owner, so it cannot reach the
-- owner-gated setup RPCs (admin_assign_setup_player, admin_reorder_setup_teams)
-- added on 2026-08-23. Tests that exercise those RPCs' business logic (not
-- just the tier guard) act as this owner instead.
create or replace function tests.owner_id() returns uuid language sql immutable as $$
  select '00000000-0000-0000-0000-000000000098'::uuid
$$;

create or replace function tests.acting_as(p_profile_id uuid) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_profile_id, 'role', 'authenticated')::text, true);
$$;

create or replace function tests.fixture() returns uuid
language plpgsql as $$
declare
  v_draft uuid;
  v_team uuid;
  n int;
  budgets int[] := array[100, 90, 80, 70];
  r public.lol_role;
begin
  -- profiles (id only; no auth.users rows needed — see Task 3 note)
  insert into public.profiles (id, display_name, is_admin)
    values (tests.admin_id(), 'Admin', true)
    on conflict (id) do nothing;
  insert into public.profiles (id, display_name, is_admin, is_owner)
    values (tests.owner_id(), 'Owner', true, true)
    on conflict (id) do nothing;
  for n in 1..4 loop
    insert into public.profiles (id, display_name)
      values (tests.cap(n), 'Captain ' || n)
      on conflict (id) do nothing;
  end loop;

  insert into public.drafts (name) values ('Test Draft') returning id into v_draft;

  for n in 1..4 loop
    insert into public.teams (draft_id, name, abbreviation, captain_profile_id, nomination_position,
                              budget_start, points_remaining)
    values (v_draft, 'Team ' || chr(64 + n), 'T' || chr(64 + n), tests.cap(n), n, budgets[n], budgets[n])
    returning id into v_team;

    insert into public.players (draft_id, display_name, role, team_id, price, acquisition)
    values (v_draft, 'Captain ' || n, 'top', v_team, 0, 'captain'),
           (v_draft, 'FA '      || n, 'jungle', v_team, 0, 'free_agency');
  end loop;

  foreach r in array array['mid','adc','support']::public.lol_role[] loop
    for n in 1..4 loop
      insert into public.players (draft_id, display_name, role)
      values (v_draft, initcap(r::text) || n, r);
    end loop;
  end loop;

  return v_draft;
end $$;

create or replace function tests.go_live(p_draft_id uuid) returns void
language sql as $$
  update public.drafts
  set status = 'live',
      current_nominator_team_id = (select id from public.teams
                                   where draft_id = p_draft_id and nomination_position = 1)
  where id = p_draft_id;
$$;
