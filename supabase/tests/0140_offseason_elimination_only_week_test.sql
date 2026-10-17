-- Offseason elimination-only week (20261109000001): with four teams' worth of
-- players left everyone plays the elimination tier, so the week has no main
-- draft, and importing the elimination draft starts the week's play.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Elim Cap One'), (tests.cap(2), 'Elim Cap Two')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0140', 'Elimination-only Offseason', false);

-- Two captains on top and jungle, and the eight players their teams need.
insert into public.offseason_entrants (event_id, profile_id, display_name, riot_id, primary_role) values
  ('00000000-0000-0000-0000-0000000e0140', tests.cap(1), 'Elim Cap One', 'Elim Cap One#OS1', 'top'),
  ('00000000-0000-0000-0000-0000000e0140', tests.cap(2), 'Elim Cap Two', 'Elim Cap Two#OS1', 'jungle');
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role)
select '00000000-0000-0000-0000-0000000e0140', 'Elim Pool ' || n, 'Elim Pool ' || n || '#OS1',
       (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role
from generate_series(1, 8) n;

insert into public.offseason_weeks (id, event_id, week_number)
  values ('00000000-0000-0000-0000-0000000f0140', '00000000-0000-0000-0000-0000000e0140', 5);

-- === 1-4. locking and drafting a week with no main tier ======================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_apply_roles('00000000-0000-0000-0000-0000000e0140',
            (select jsonb_agg(jsonb_build_object('entrant_id', id, 'role', primary_role, 'status', 'active'))
               from public.offseason_entrants where event_id = '00000000-0000-0000-0000-0000000e0140')),
          10, 'staff give all ten players a role');
select is(public.offseason_set_week_entries('00000000-0000-0000-0000-0000000f0140',
            (select jsonb_agg(jsonb_build_object(
                'entrant_id', id, 'tier', 'elimination',
                'captain_seat', case profile_id when '00000000-0000-0000-0000-000000000001' then 1
                                                when '00000000-0000-0000-0000-000000000002' then 2 end))
               from public.offseason_entrants where event_id = '00000000-0000-0000-0000-0000000e0140')),
          10, 'staff lock a week where everyone plays the elimination tier');
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0140', 'elimination', 100) $$,
                'staff create the elimination draft with no main draft');
reset role;
select is((select status from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0140'),
          'drafting', 'the week is drafting');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.start_draft((select elimination_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0140')) $$,
                'the ordinary start_draft accepts it');

-- Finish it: each team buys the pool player for every role it lacks.
do $$
declare
  v_team record;
  r public.lol_role;
  v_player uuid;
  v_draft uuid := (select elimination_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0140');
begin
  for v_team in select id from public.teams where draft_id = v_draft order by nomination_position loop
    foreach r in array public.open_roles(v_team.id) loop
      select id into v_player from public.players
        where draft_id = v_draft and role = r and team_id is null order by display_name limit 1;
      update public.players set team_id = v_team.id, acquisition = 'auction', price = 7 where id = v_player;
    end loop;
  end loop;
end $$;

-- === 5-7. importing it starts the week ======================================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_import_week_draft('00000000-0000-0000-0000-0000000f0140', 'elimination'),
          2, 'the elimination auction becomes two teams');
reset role;
select is((select status from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0140'),
          'playing', 'with no main tier, importing the elimination tier starts play');

select * from finish();
rollback;
