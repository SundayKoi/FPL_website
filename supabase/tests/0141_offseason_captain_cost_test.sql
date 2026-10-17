-- Offseason captain cost (20261110000001): staff set what a captain costs
-- when they create a week's draft. It is the captain's price and comes off
-- the team's budget; it is never 0, and it leaves a point for every other role.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(8);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Cost Cap One'), (tests.cap(2), 'Cost Cap Two')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0141', 'Captain-cost Offseason', false);
insert into public.offseason_entrants (event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000e0141', tests.cap(1), 'Cost Cap One', 'Cost Cap One#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000e0141', tests.cap(2), 'Cost Cap Two', 'Cost Cap Two#OS1', 'jungle', 'jungle');
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role, assigned_role)
select '00000000-0000-0000-0000-0000000e0141', 'Cost Pool ' || n, 'Cost Pool ' || n || '#OS1', r, r
from generate_series(1, 8) n,
     lateral (select (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role as r) roles;

-- Two weeks with the same ten players: one drafted with a captain cost, one
-- by a caller that predates it.
insert into public.offseason_weeks (id, event_id, week_number) values
  ('00000000-0000-0000-0000-0000000f0141', '00000000-0000-0000-0000-0000000e0141', 1),
  ('00000000-0000-0000-0000-0000000f1141', '00000000-0000-0000-0000-0000000e0141', 2);
insert into public.offseason_week_entries (week_id, entrant_id, tier, captain_seat)
select w.id, e.id, 'main',
       case e.profile_id when tests.cap(1) then 1 when tests.cap(2) then 2 end
from public.offseason_entrants e
cross join (values ('00000000-0000-0000-0000-0000000f0141'::uuid), ('00000000-0000-0000-0000-0000000f1141'::uuid)) w(id)
where e.event_id = '00000000-0000-0000-0000-0000000e0141';

-- === 1-2. a captain is never free, and never takes the whole budget =========
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0141', 'main', 100,
                        p_round_minimums => '{1}', p_captain_cost => 0) $$,
                   'CAPTAIN_COST_INVALID%', 'a captain cannot cost 0');
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0141', 'main', 100,
                        p_round_minimums => '{1}', p_captain_cost => 97) $$,
                   'CAPTAIN_COST_INVALID%', 'a captain leaves a point for each of the other four roles');

-- === 3-5. the cost is the captain's price and comes off the budget ==========
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0141', 'main', 100,
                     p_round_minimums => '{1}', p_captain_cost => 15) $$,
                'staff create a draft whose captains cost 15');
reset role;
select ok((select bool_and(p.price = 15)
             from public.players p
            where p.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0141')
              and p.acquisition = 'captain'),
          'each captain is bought for the cost');
select ok((select count(*) = 2 and bool_and(budget_start = 100 and points_remaining = 85)
             from public.teams
            where draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0141')),
          'each team starts with the budget less its captain');

-- === 6-7. a caller that predates the cost still works =======================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f1141', 'main', 100) $$,
                'a call without a captain cost still creates the draft');
reset role;
select ok((select bool_and(points_remaining = 100)
             from public.teams
            where draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f1141')),
          'and keeps the old free captain');

-- === 8. one function, not two overloads =====================================
select ok(to_regprocedure('public.offseason_create_week_draft(uuid,text,int,int,int[])') is null,
          'the old signature is gone');

select * from finish();
rollback;
