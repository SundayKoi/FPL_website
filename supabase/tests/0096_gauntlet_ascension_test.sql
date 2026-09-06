-- Gauntlet ascension — one level per clear, never past the top.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(8);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0096'::uuid, 'asc-0096', 'Climber');
insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('asc-0096', '00000000-0000-0000-0000-0000000e0096'::uuid, 'Climber', 100);

select has_column('public', 'gauntlet_runs', 'ascension', 'a run records the level it was fought at');
select has_column('public', 'gauntlet_round_log', 'ascension', 'and so does the tape');
select throws_ok(
  $$ insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, ascension)
     values ('asc-0096', 'S_TEST_ASC', date '2026-08-24', '[]'::jsonb, 74, 6) $$,
  '23514', null, 'a run cannot be above the top of the ladder');

select is(public.gauntlet_ascend('asc-0096', 'S_TEST_ASC', 0), 1, 'a clear at level 0 unlocks level 1');
select is(public.gauntlet_ascend('asc-0096', 'S_TEST_ASC', 0), 1, 'clearing level 0 again unlocks nothing new');
select is((select clears from public.gauntlet_ascension where discord_id = 'asc-0096' and season = 'S_TEST_ASC'), 2, 'but counts');
select is(public.gauntlet_ascend('asc-0096', 'S_TEST_ASC', 4), 5, 'a clear at level 4 unlocks the top');
select is(public.gauntlet_ascend('asc-0096', 'S_TEST_ASC', 5), 5, 'and the top is the top');

select * from finish();
rollback;
