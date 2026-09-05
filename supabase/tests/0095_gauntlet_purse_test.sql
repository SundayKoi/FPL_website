-- The Gauntlet's purse — one door to bank it, and it pays once.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0095'::uuid, 'purse-0095', 'Purse Runner');
insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('purse-0095', '00000000-0000-0000-0000-0000000e0095'::uuid, 'Purse Runner', 100);

-- A live run between fights with 48 in the purse (four rounds cleared).
insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, round, status, purse, relic_offer)
values ('purse-0095', 'S_TEST_PURSE', date '2026-08-24', '[]'::jsonb, 74, 5, 'active', 48, '["overtime","pit_boss","first_blood"]'::jsonb);

create or replace function tests.purse_run() returns bigint
language sql stable as $$ select id from public.gauntlet_runs where season = 'S_TEST_PURSE' order by id limit 1 $$;

select has_column('public', 'gauntlet_runs', 'purse', 'a run carries a purse');
select has_column('public', 'gauntlet_runs', 'purse_paid', 'and remembers what it paid');

-- === mid-fight: the purse is on the table ======================================
update public.gauntlet_runs set crossroads = '{"state":{},"seed2":1}'::jsonb where id = tests.purse_run();
select throws_ok(
  $$ select * from public.gauntlet_cash_out('purse-0095', tests.purse_run()) $$,
  'P0001', 'fight in progress', 'nothing banks once the first half has been played');
update public.gauntlet_runs set crossroads = null where id = tests.purse_run();

select throws_ok(
  $$ select * from public.gauntlet_cash_out('someone-else', tests.purse_run()) $$,
  'P0001', 'unknown run', 'only the owner banks');

-- === banking ===================================================================
create temporary table purse_bank on commit drop as
  select * from public.gauntlet_cash_out('purse-0095', tests.purse_run());

select is((select paid from purse_bank), 48::bigint, 'banking pays the purse');
select is((select balance from purse_bank), 148::bigint, 'into the wallet');
select is((select status from public.gauntlet_runs where id = tests.purse_run()), 'banked', 'and ends the run');
select is((select relic_offer from public.gauntlet_runs where id = tests.purse_run()), null, 'with the offer cleared');
select is(
  (select count(*) from public.betting_ledger where discord_id = 'purse-0095' and reason = 'gauntlet_purse')::int, 1,
  'on its own ledger row');
select throws_ok(
  $$ select * from public.gauntlet_cash_out('purse-0095', tests.purse_run()) $$,
  'P0001', 'already paid', 'and never pays twice');

-- === a fallen run pays nothing ================================================
insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, round, status, purse)
values ('purse-0095', 'S_TEST_PURSE', date '2026-08-24', '[]'::jsonb, 74, 3, 'fallen', 20);
select throws_ok(
  $$ select * from public.gauntlet_cash_out('purse-0095', (select id from public.gauntlet_runs where season = 'S_TEST_PURSE' and status = 'fallen')) $$,
  'P0001', 'run is over', 'a fallen run''s purse is gone');

select * from finish();
rollback;
