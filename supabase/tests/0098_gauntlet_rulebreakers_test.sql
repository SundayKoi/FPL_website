-- Gauntlet rule-changers — the run remembers what was spent, and a hand
-- is one run's.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(6);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0098'::uuid, 'deal-0098', 'Dealer');
insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('deal-0098', '00000000-0000-0000-0000-0000000e0098'::uuid, 'Dealer', 100);

select has_column('public', 'gauntlet_runs', 'second_wind_used', 'a run remembers the second wind');
select has_column('public', 'gauntlet_runs', 'reroll_used', 'and the rematch');
select has_column('public', 'gauntlet_runs', 'drafted', 'and whether it was drafted');
select has_table('public', 'gauntlet_deals', 'a dealt hand is recorded');

insert into public.gauntlet_deals (discord_id, season, week_start, ids)
values ('deal-0098', 'S_TEST_DEAL', date '2026-08-24', array[1, 2, 3]::bigint[]);
insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, drafted)
values ('deal-0098', 'S_TEST_DEAL', date '2026-08-24', '[]'::jsonb, 74, true);
update public.gauntlet_deals set run_id = (select id from public.gauntlet_runs where season = 'S_TEST_DEAL')
  where discord_id = 'deal-0098';
select isnt((select run_id from public.gauntlet_deals where discord_id = 'deal-0098'), null, 'a used hand names its run');
delete from public.gauntlet_runs where season = 'S_TEST_DEAL';
select is((select run_id from public.gauntlet_deals where discord_id = 'deal-0098'), null, 'and forgets it when the run goes');

select * from finish();
rollback;
