-- Offseason tournament codes (20261117000001): staff paste codes into the
-- event's pool, every scheduled game gets one in schedule order, and only the
-- players on a match's two teams (and staff) read its codes.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(19);

-- === fixture =================================================================
insert into public.profiles (id, display_name, is_admin)
  values (tests.admin_id(), 'Admin', true) on conflict (id) do nothing;
insert into public.profiles (id, display_name) values
  (tests.cap(1), 'Codes A'), (tests.cap(2), 'Codes B'), (tests.cap(3), 'Codes C'),
  (tests.cap(4), 'Codes D'), (tests.cap(5), 'Codes Fan')
  on conflict (id) do nothing;

insert into public.offseason_events (id, name, signups_open, status)
  values ('00000000-0000-0000-0000-0000000e0148', 'Codes Offseason', false, 'running');
insert into public.offseason_entrants (id, event_id, profile_id, display_name, riot_id, primary_role, assigned_role) values
  ('00000000-0000-0000-0000-0000000a0148', '00000000-0000-0000-0000-0000000e0148', tests.cap(1), 'Codes A', 'Codes A#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000b0148', '00000000-0000-0000-0000-0000000e0148', tests.cap(2), 'Codes B', 'Codes B#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000c0148', '00000000-0000-0000-0000-0000000e0148', tests.cap(3), 'Codes C', 'Codes C#OS1', 'top', 'top'),
  ('00000000-0000-0000-0000-0000000d0148', '00000000-0000-0000-0000-0000000e0148', tests.cap(4), 'Codes D', 'Codes D#OS1', 'top', 'top');
insert into public.offseason_weeks (id, event_id, week_number, status)
  values ('00000000-0000-0000-0000-0000000f0148', '00000000-0000-0000-0000-0000000e0148', 1, 'playing');
insert into public.offseason_teams (id, week_id, tier, name) values
  ('00000000-0000-0000-0000-0000001a0148', '00000000-0000-0000-0000-0000000f0148', 'main', 'Team A'),
  ('00000000-0000-0000-0000-0000001b0148', '00000000-0000-0000-0000-0000000f0148', 'main', 'Team B'),
  ('00000000-0000-0000-0000-0000001c0148', '00000000-0000-0000-0000-0000000f0148', 'main', 'Team C'),
  ('00000000-0000-0000-0000-0000001d0148', '00000000-0000-0000-0000-0000000f0148', 'main', 'Team D');
insert into public.offseason_team_members (team_id, entrant_id, role) values
  ('00000000-0000-0000-0000-0000001a0148', '00000000-0000-0000-0000-0000000a0148', 'top'),
  ('00000000-0000-0000-0000-0000001b0148', '00000000-0000-0000-0000-0000000b0148', 'top'),
  ('00000000-0000-0000-0000-0000001c0148', '00000000-0000-0000-0000-0000000c0148', 'top'),
  ('00000000-0000-0000-0000-0000001d0148', '00000000-0000-0000-0000-0000000d0148', 'top');
-- Two Bo1s and a Bo3: five games, scheduled before any code exists.
insert into public.offseason_matches (id, week_id, stage, sort_order, team_a_id, team_b_id, best_of) values
  ('00000000-0000-0000-0000-0000002a0148', '00000000-0000-0000-0000-0000000f0148', 'round_robin', 1,
   '00000000-0000-0000-0000-0000001a0148', '00000000-0000-0000-0000-0000001b0148', 1),
  ('00000000-0000-0000-0000-0000002b0148', '00000000-0000-0000-0000-0000000f0148', 'round_robin', 2,
   '00000000-0000-0000-0000-0000001c0148', '00000000-0000-0000-0000-0000001d0148', 1),
  ('00000000-0000-0000-0000-0000002c0148', '00000000-0000-0000-0000-0000000f0148', 'round_robin', 3,
   '00000000-0000-0000-0000-0000001a0148', '00000000-0000-0000-0000-0000001c0148', 3);

-- === 1-2. only staff add codes ===============================================
set local role anon;
select throws_ok($$ select public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', '{TEST-1}') $$,
                 '42501', null, 'a visitor cannot add codes');
reset role;

select tests.acting_as(tests.cap(5));
set local role authenticated;
select throws_like($$ select public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', '{TEST-1}') $$,
                   'NOT_ADMIN%', 'a player cannot add codes');
reset role;

-- === 3-7. pasted codes go to the schedule in order ===========================
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', array['TEST-1', ' TEST-2 ', '', 'TEST-3', 'TEST-1', 'TEST-4']),
          '{"added": 4, "skipped": 1, "assigned": 4, "pooled": 0}'::jsonb,
          'blanks are ignored, repeats skipped, and every code finds a game');
select results_eq($$ select code, match_id, game_number from public.offseason_match_codes order by seq $$,
                  $$ values ('TEST-1'::text, '00000000-0000-0000-0000-0000002a0148'::uuid, 1),
                            ('TEST-2'::text, '00000000-0000-0000-0000-0000002b0148'::uuid, 1),
                            ('TEST-3'::text, '00000000-0000-0000-0000-0000002c0148'::uuid, 1),
                            ('TEST-4'::text, '00000000-0000-0000-0000-0000002c0148'::uuid, 2) $$,
                  'codes go match by match, game by game');
select throws_like($$ select public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', '{"not a code"}') $$,
                   'CODE_INVALID%', 'only tournament codes are stored');
select is(public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', '{TEST-5,TEST-6,TEST-7}'),
          '{"added": 3, "skipped": 0, "assigned": 1, "pooled": 2}'::jsonb,
          'codes no game needs yet wait in the pool');
select is((select game_number from public.offseason_match_codes where code = 'TEST-5'), 3,
          'the Bo3''s last game gets the next code');
reset role;

-- === 8-13. only the two teams read a match's codes ===========================
select tests.acting_as(tests.cap(1));
set local role authenticated;
select results_eq($$ select code from public.offseason_match_codes order by seq $$,
                  $$ values ('TEST-1'::text), ('TEST-3'::text), ('TEST-4'::text), ('TEST-5'::text) $$,
                  'a player reads the codes of their own team''s matches');
select throws_ok($$ insert into public.offseason_match_codes (event_id, code) values ('00000000-0000-0000-0000-0000000e0148', 'MINE-1') $$,
                 '42501', null, 'nobody writes codes directly');
reset role;

select tests.acting_as(tests.cap(4));
set local role authenticated;
select results_eq($$ select code from public.offseason_match_codes $$, $$ values ('TEST-2'::text) $$,
                  'and nothing of other teams'' matches');
reset role;

select tests.acting_as(tests.cap(5));
set local role authenticated;
select is((select count(*)::int from public.offseason_match_codes), 0, 'someone on no team reads no codes');
reset role;

set local role anon;
select throws_ok($$ select code from public.offseason_match_codes $$, '42501', null, 'visitors cannot read codes');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select is((select count(*)::int from public.offseason_match_codes), 7, 'staff read every code, the pool included');
reset role;

-- === 14-18. the schedule changing moves codes ================================
insert into public.offseason_matches (id, week_id, stage, sort_order, team_a_id, team_b_id, best_of) values
  ('00000000-0000-0000-0000-0000002d0148', '00000000-0000-0000-0000-0000000f0148', 'round_robin', 4,
   '00000000-0000-0000-0000-0000001b0148', '00000000-0000-0000-0000-0000001d0148', 1);
select is((select code from public.offseason_match_codes where match_id = '00000000-0000-0000-0000-0000002d0148'), 'TEST-6',
          'a new match takes the next code in the pool');

insert into public.offseason_games (match_id, game_number, winner_team_id) values
  ('00000000-0000-0000-0000-0000002c0148', 1, '00000000-0000-0000-0000-0000001a0148'),
  ('00000000-0000-0000-0000-0000002c0148', 2, '00000000-0000-0000-0000-0000001a0148');
update public.offseason_matches set winner_team_id = '00000000-0000-0000-0000-0000001a0148'
  where id = '00000000-0000-0000-0000-0000002c0148';
select results_eq($$ select code from public.offseason_match_codes where match_id = '00000000-0000-0000-0000-0000002c0148' order by game_number $$,
                  $$ values ('TEST-3'::text), ('TEST-4'::text) $$,
                  'a Bo3 won 2-0 hands its unplayed game''s code back');

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like($$ select public.offseason_remove_match_code((select id from public.offseason_match_codes where code = 'TEST-1')) $$,
                   'NOT_ADMIN%', 'a player cannot remove a code');
reset role;

select tests.acting_as(tests.admin_id());
set local role authenticated;
select lives_ok($$ select public.offseason_remove_match_code((select id from public.offseason_match_codes where code = 'TEST-1')) $$,
                'staff remove a bad code');
reset role;
select is((select code from public.offseason_match_codes where match_id = '00000000-0000-0000-0000-0000002a0148'), 'TEST-5',
          'and its game takes the oldest code in the pool');

-- === 19. a finished week takes no more codes =================================
delete from public.offseason_matches where id = '00000000-0000-0000-0000-0000002d0148';
update public.offseason_weeks set status = 'complete' where id = '00000000-0000-0000-0000-0000000f0148';
select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(public.offseason_add_match_codes('00000000-0000-0000-0000-0000000e0148', '{TEST-8}'),
          '{"added": 1, "skipped": 0, "assigned": 0, "pooled": 3}'::jsonb,
          'a deleted match''s code goes back to the pool, and a complete week takes none');
reset role;

select * from finish();
rollback;
