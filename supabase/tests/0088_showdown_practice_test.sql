-- A practice table moves no money: sitting debits nothing, standing
-- credits nothing, and the ledger stays silent either way.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(8);

select test_profile(300) as carol \gset

insert into public.showdown_tables (bracket, season, name) values ('free', 'S_TEST_SD', 'Practice felt')
  returning id as t \gset

select is((select free from public.showdown_brackets where key = 'free'), true, 'the free bracket is seeded free');
select is((select free from public.showdown_brackets where key = 'open'), false, 'and the open bracket is not');

-- Carol has 300 and sits with a 1,000 stack: no wallet could pay that,
-- and none is asked to.
select lives_ok(
  format($q$ select showdown_sit(%s, %L, 0, 1000, '{}'::bigint[], true) $q$, :t, :'carol'),
  'a practice seat costs nothing');
select is((select balance from betting_profiles where discord_id = :'carol'), 300::bigint, 'her wallet is untouched');
select is((select count(*)::int from betting_ledger where discord_id = :'carol' and reason like 'showdown_%'), 0, 'and the ledger says nothing');
select is((select chips from showdown_seats where discord_id = :'carol'), 1000::bigint, 'the play chips are on the table');

select lives_ok(
  format($q$ select showdown_stand(%s, %L) $q$, :t, :'carol'),
  'standing up from a practice table works');
select is((select balance from betting_profiles where discord_id = :'carol'), 300::bigint, 'and pays out nothing');

select * from finish();
rollback;
