-- Offseason captain costs (20261114000001): each captain has their own cost,
-- set per captain when staff create a week's draft. It is that captain's
-- price and comes off their own team's budget.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(10);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Costs Cap One'), (tests.cap(2), 'Costs Cap Two')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open)
  values ('00000000-0000-0000-0000-0000000e0146', 'Captain-costs Offseason', false);
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0146', '00000000-0000-0000-0000-0000000e0146', tests.cap(1), 'Costs Cap One', 'Costs Cap One#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000b0146', '00000000-0000-0000-0000-0000000e0146', tests.cap(2), 'Costs Cap Two', 'Costs Cap Two#OS1', 'jungle', 'jungle');
insert into public.offseason_entrants (event_id, display_name, riot_id, primary_role, assigned_role)
select '00000000-0000-0000-0000-0000000e0146', 'Costs Pool ' || n, 'Costs Pool ' || n || '#OS1', r, r
from generate_series(1, 8) n,
     lateral (select (array['top', 'jungle', 'mid', 'mid', 'adc', 'adc', 'support', 'support'])[n]::public.lol_role as r) roles;

-- Two weeks with the same ten players: one drafted with a cost per captain,
-- one by a caller that still sends one cost for all.
insert into public.offseason_weeks (id, event_id, week_number) values
  ('00000000-0000-0000-0000-0000000f0146', '00000000-0000-0000-0000-0000000e0146', 1),
  ('00000000-0000-0000-0000-0000000f1146', '00000000-0000-0000-0000-0000000e0146', 2);
insert into public.offseason_week_entries (week_id, entrant_id, tier, captain_seat)
select w.id, e.id, 'main',
       case e.profile_id when tests.cap(1) then 1 when tests.cap(2) then 2 end
from public.offseason_entrants e
cross join (values ('00000000-0000-0000-0000-0000000f0146'::uuid), ('00000000-0000-0000-0000-0000000f1146'::uuid)) w(id)
where e.event_id = '00000000-0000-0000-0000-0000000e0146';

-- === 1-5. every captain needs a valid cost of their own ======================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                        p_round_minimums => '{1}', p_captain_costs => '{"00000000-0000-0000-0000-0000000a0146": 20}') $$,
                   'CAPTAIN_COST_MISSING%', 'every captain needs a cost');
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                        p_round_minimums => '{1}', p_captain_costs => '{"00000000-0000-0000-0000-0000000a0146": 20, "00000000-0000-0000-0000-0000000b0146": 0}') $$,
                   'CAPTAIN_COST_INVALID%', 'a captain cannot cost 0');
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                        p_round_minimums => '{1}', p_captain_costs => '{"00000000-0000-0000-0000-0000000a0146": 97, "00000000-0000-0000-0000-0000000b0146": 12}') $$,
                   'CAPTAIN_COST_INVALID%', 'a captain leaves a point for each of the other four roles');
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                        p_round_minimums => '{1}', p_captain_costs => '{"00000000-0000-0000-0000-0000000a0146": 20.5, "00000000-0000-0000-0000-0000000b0146": 12}') $$,
                   'CAPTAIN_COST_INVALID%', 'a cost is a whole number');
select throws_like($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                        p_round_minimums => '{1}', p_captain_costs => '[20, 12]') $$,
                   'CAPTAIN_COST_INVALID%', 'costs are keyed by captain');

-- === 6-8. each captain is bought for their own cost ==========================
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f0146', 'main', 100,
                     p_round_minimums => '{1}', p_captain_costs => '{"00000000-0000-0000-0000-0000000a0146": 20, "00000000-0000-0000-0000-0000000b0146": 12}') $$,
                'staff create a draft with a cost per captain');
reset role;
select results_eq($$ select p.display_name, p.price from public.players p
                     where p.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0146')
                       and p.acquisition = 'captain' order by p.display_name $$,
                  $$ values ('Costs Cap One'::text, 20), ('Costs Cap Two'::text, 12) $$,
                  'each captain is bought for their own cost');
select results_eq($$ select t.name, t.budget_start, t.points_remaining from public.teams t
                     where t.draft_id = (select main_draft_id from public.offseason_weeks where id = '00000000-0000-0000-0000-0000000f0146')
                     order by t.nomination_position $$,
                  $$ values ('Team Costs Cap One'::text, 100, 80), ('Team Costs Cap Two'::text, 100, 88) $$,
                  'each team starts with the budget less its own captain');

-- === 9. one cost for all still works until the new site ships ================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_create_week_draft('00000000-0000-0000-0000-0000000f1146', 'main', 100,
                     p_round_minimums => '{1}', p_captain_cost => 15) $$,
                'a caller that sends one cost for every captain still works');
reset role;

-- === 10. one function, not two overloads =====================================
select ok(to_regprocedure('public.offseason_create_week_draft(uuid,text,int,int,int[],int)') is null,
          'the previous signature is gone');

select * from finish();
rollback;
