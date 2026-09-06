-- Gauntlet contracts — paid once a week, and counted for the season.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0097'::uuid, 'con-0097', 'Contractor');
insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('con-0097', '00000000-0000-0000-0000-0000000e0097'::uuid, 'Contractor', 100);
insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, round, status, opener)
values ('con-0097', 'S_TEST_CON', date '2026-08-24', '[]'::jsonb, 74, 3, 'active', 'warm_up');

create or replace function tests.con_run() returns bigint
language sql stable as $$ select id from public.gauntlet_runs where season = 'S_TEST_CON' $$;

select has_column('public', 'gauntlet_runs', 'opener', 'a run records the opener it brought');

select is(public.gauntlet_complete_contract('con-0097', 'S_TEST_CON', date '2026-08-24', 'the_steal', tests.con_run(), 40), 40::bigint,
  'a contract pays its reward');
select is((select balance from public.betting_profiles where discord_id = 'con-0097'), 140::bigint, 'into the wallet');
select is(public.gauntlet_complete_contract('con-0097', 'S_TEST_CON', date '2026-08-24', 'the_steal', tests.con_run(), 40), 0::bigint,
  'and never twice in a week');
select is((select balance from public.betting_profiles where discord_id = 'con-0097'), 140::bigint, 'the second call paid nothing');
select is(public.gauntlet_complete_contract('con-0097', 'S_TEST_CON', date '2026-08-31', 'the_steal', null, 40), 40::bigint,
  'a new week pays it again');
select is((select count(*) from public.gauntlet_contracts where discord_id = 'con-0097' and season = 'S_TEST_CON')::int, 2,
  'and the season counts both');

select * from finish();
rollback;
