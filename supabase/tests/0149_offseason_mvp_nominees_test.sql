-- Offseason MVP nominees (20261118000001): staff pick two to five of a week's
-- players, everyone reads them, and votes go to nominees only. Changing the
-- nominees drops the votes of anyone no longer nominated.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Nominee Fan'), (tests.cap(2), 'Other Fan')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e0149', 'Nominee Offseason', false, 'running');
insert into public.offseason_entrants (id, event_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0149', '00000000-0000-0000-0000-0000000e0149', 'Ace', 'Ace#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000b0149', '00000000-0000-0000-0000-0000000e0149', 'Brick', 'Brick#OS1', 'jungle', 'jungle'),
  ('00000000-0000-0000-0000-0000000c0149', '00000000-0000-0000-0000-0000000e0149', 'Comet', 'Comet#OS1', 'mid', 'mid'),
  ('00000000-0000-0000-0000-0000000d0149', '00000000-0000-0000-0000-0000000e0149', 'Dud', 'Dud#OS1', 'adc', 'adc'),
  ('00000000-0000-0000-0000-0000001d0149', '00000000-0000-0000-0000-0000000e0149', 'Bench', 'Bench#OS1', 'support', 'support');
insert into public.offseason_weeks (id, event_id, week_number, status)
  values ('00000000-0000-0000-0000-0000000f0149', '00000000-0000-0000-0000-0000000e0149', 1, 'complete');
insert into public.offseason_teams (id, week_id, tier, name)
  values ('00000000-0000-0000-0000-0000002a0149', '00000000-0000-0000-0000-0000000f0149', 'main', 'Team Ace');
insert into public.offseason_team_members (team_id, entrant_id, role) values
  ('00000000-0000-0000-0000-0000002a0149', '00000000-0000-0000-0000-0000000a0149', 'top'),
  ('00000000-0000-0000-0000-0000002a0149', '00000000-0000-0000-0000-0000000b0149', 'jungle'),
  ('00000000-0000-0000-0000-0000002a0149', '00000000-0000-0000-0000-0000000c0149', 'mid'),
  ('00000000-0000-0000-0000-0000002a0149', '00000000-0000-0000-0000-0000000d0149', 'adc');

-- === 1-6. only staff nominate, two to five of the week's players ============
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                        array['00000000-0000-0000-0000-0000000a0149', '00000000-0000-0000-0000-0000000b0149']::uuid[]) $$,
                   'NOT_ADMIN%', 'a player cannot nominate');
select throws_ok($$ insert into public.offseason_mvp_nominees (week_id, entrant_id, position)
                    values ('00000000-0000-0000-0000-0000000f0149', '00000000-0000-0000-0000-0000000a0149', 1) $$,
                 '42501', null, 'nobody writes nominees directly');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                        array['00000000-0000-0000-0000-0000000a0149']::uuid[]) $$,
                   'NOMINEES_INVALID%', 'one nominee is not a vote');
select throws_like($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                        array['00000000-0000-0000-0000-0000000a0149', '00000000-0000-0000-0000-0000000a0149']::uuid[]) $$,
                   'NOMINEES_INVALID%', 'nobody is nominated twice');
select throws_like($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                        array['00000000-0000-0000-0000-0000000a0149', '00000000-0000-0000-0000-0000001d0149']::uuid[]) $$,
                   'NOT_PLAYING%', 'only the week''s players can be nominated');
select lives_ok($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                     array['00000000-0000-0000-0000-0000000c0149', '00000000-0000-0000-0000-0000000a0149', '00000000-0000-0000-0000-0000000b0149']::uuid[]) $$,
                'staff nominate three');
reset role;

-- === 7-8. everyone reads them, in order ======================================
set local role anon;
select results_eq($$ select entrant_id from public.offseason_mvp_nominees where week_id = '00000000-0000-0000-0000-0000000f0149' order by position $$,
                  $$ values ('00000000-0000-0000-0000-0000000c0149'::uuid), ('00000000-0000-0000-0000-0000000a0149'::uuid), ('00000000-0000-0000-0000-0000000b0149'::uuid) $$,
                  'visitors read the nominees in staff''s order');
reset role;
select is((select count(*)::int from public.offseason_mvp_nominees), 3, 'three nominees');

-- === 9-11. votes go to nominees only =========================================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0149', '00000000-0000-0000-0000-0000000d0149') $$,
                   'NOT_NOMINATED%', 'a player who wasn''t nominated gets no votes');
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0149', '00000000-0000-0000-0000-0000000b0149') $$,
                'a fan votes for a nominee');
reset role;
select tests.acting_as(tests.cap(2));
set local role authenticated;
select lives_ok($$ select public.offseason_vote_mvp('00000000-0000-0000-0000-0000000f0149', '00000000-0000-0000-0000-0000000c0149') $$,
                'another fan votes for another');
reset role;

-- === 12-14. changing the nominees drops votes for anyone dropped =============
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149',
                     array['00000000-0000-0000-0000-0000000c0149', '00000000-0000-0000-0000-0000000d0149']::uuid[]) $$,
                'staff change the nominees');
reset role;
select results_eq($$ select entrant_id from public.offseason_mvp_votes where week_id = '00000000-0000-0000-0000-0000000f0149' $$,
                  $$ values ('00000000-0000-0000-0000-0000000c0149'::uuid) $$,
                  'a vote for a dropped nominee is gone, the other stays');
select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_set_mvp_nominees('00000000-0000-0000-0000-0000000f0149', '{}'::uuid[]) $$,
                'staff can clear the nominees');
reset role;

select * from finish();
rollback;
