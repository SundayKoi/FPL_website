-- The Gauntlet's balance tape.
--
-- The aggregation itself is pure TypeScript and tested there
-- (src/lib/gauntlet/balance.test.ts). What only Postgres can promise is
-- what this suite checks: that a call is recorded once per (run, round) so
-- the double-click race can't double-count it, that the tape is deny-all
-- like every other cards table, that it belongs to the service role, and
-- that deleting a run takes its telemetry with it.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0071'::uuid, 'tele-0071', 'Telemetry Runner');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('tele-0071', '00000000-0000-0000-0000-0000000e0071'::uuid, 'Telemetry Runner', 500);

insert into public.gauntlet_runs (discord_id, season, week_start, lineup, lineup_avg, round, status)
values ('tele-0071', 'S_TEST_TELE', date '2026-08-24', '[]'::jsonb, 74, 3, 'active');

create or replace function tests.tele_run() returns bigint
language sql stable as $$
  select id from public.gauntlet_runs where season = 'S_TEST_TELE'
$$;

-- === the tables exist, deny-all, service-role owned ==========================
select has_table('public', 'gauntlet_round_log', 'the round log exists');
select has_table('public', 'gauntlet_relic_offers', 'the offer log exists');

select is(
  (select relrowsecurity from pg_class where oid = 'public.gauntlet_round_log'::regclass),
  true, 'the round log has RLS on');
select is(
  (select relrowsecurity from pg_class where oid = 'public.gauntlet_relic_offers'::regclass),
  true, 'the offer log has RLS on');

-- Deny-all means exactly that: no policy grants anyone anything, so only
-- the service role (which bypasses RLS) can read the tape.
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('gauntlet_round_log', 'gauntlet_relic_offers')),
  0, 'no policy opens the tape to a player');

select ok(
  has_table_privilege('service_role', 'public.gauntlet_round_log', 'INSERT'),
  'the service role writes the round log');
select ok(
  has_table_privilege('service_role', 'public.gauntlet_relic_offers', 'INSERT'),
  'the service role writes the offer log');
select ok(
  not has_table_privilege('anon', 'public.gauntlet_round_log', 'SELECT'),
  'anon cannot read the round log');

-- === one row per (run, round) ================================================
insert into public.gauntlet_round_log
  (run_id, season, week_start, round, lineup_avg, situation_key, choice_key,
   won, score, daring, momentum, relics)
values (tests.tele_run(), 'S_TEST_TELE', date '2026-08-24', 3, 74,
        'the_even_game', 'take_the_fight', true, 120, 40, 58, '{ember_heart}');

select is(
  (select count(*)::int from public.gauntlet_round_log where run_id = tests.tele_run()),
  1, 'the call is on the tape');

-- The retry the CAS already lost: the second insert must not double-count.
insert into public.gauntlet_round_log
  (run_id, season, week_start, round, lineup_avg, situation_key, choice_key,
   won, score, daring, momentum)
values (tests.tele_run(), 'S_TEST_TELE', date '2026-08-24', 3, 74,
        'the_even_game', 'play_it_safe', false, 0, 0, 41)
on conflict do nothing;

select is(
  (select count(*)::int from public.gauntlet_round_log where run_id = tests.tele_run()),
  1, 'a raced retry does not double-count the call');
select is(
  (select choice_key from public.gauntlet_round_log where run_id = tests.tele_run()),
  'take_the_fight', 'the first write is the true one');

-- The next round is a different call and lands beside it.
insert into public.gauntlet_round_log
  (run_id, season, week_start, round, lineup_avg, situation_key, choice_key,
   won, score, daring, momentum)
values (tests.tele_run(), 'S_TEST_TELE', date '2026-08-24', 4, 74,
        'press_the_lead', 'close_it_out', true, 90, 0, 71);

select is(
  (select count(*)::int from public.gauntlet_round_log where run_id = tests.tele_run()),
  2, 'each round writes its own row');

insert into public.gauntlet_relic_offers
  (run_id, season, week_start, round, offered, taken, held)
values (tests.tele_run(), 'S_TEST_TELE', date '2026-08-24', 4,
        '{ember_heart,frost_ward,gold_seal}', 'frost_ward', '{ember_heart}');

insert into public.gauntlet_relic_offers
  (run_id, season, week_start, round, offered, taken)
values (tests.tele_run(), 'S_TEST_TELE', date '2026-08-24', 4,
        '{ember_heart,frost_ward,gold_seal}', 'gold_seal')
on conflict do nothing;

select is(
  (select taken from public.gauntlet_relic_offers where run_id = tests.tele_run()),
  'frost_ward', 'the offer is recorded once, as taken');

-- === the tape follows the run ================================================
delete from public.gauntlet_runs where id = tests.tele_run();

select is(
  (select count(*)::int from public.gauntlet_round_log
   where season = 'S_TEST_TELE') +
  (select count(*)::int from public.gauntlet_relic_offers
   where season = 'S_TEST_TELE'),
  0, 'deleting a run takes its telemetry with it');

select * from finish();
rollback;
