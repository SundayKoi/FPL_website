-- Expedition convoys — two squads, one clock, one set of forks.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0094'::uuid, 'host-0094', 'Host'),
       ('00000000-0000-0000-0000-0000000e0095'::uuid, 'guest-0094', 'Guest'),
       ('00000000-0000-0000-0000-0000000e0096'::uuid, 'third-0094', 'Third');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('host-0094', '00000000-0000-0000-0000-0000000e0094'::uuid, 'Host', 1000),
       ('guest-0094', '00000000-0000-0000-0000-0000000e0095'::uuid, 'Guest', 1000),
       ('third-0094', '00000000-0000-0000-0000-0000000e0096'::uuid, 'Third', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select who, 'S_TEST_CONVOY', who || '-' || n, 'Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', who || '-' || n)
from unnest(array['host-0094', 'guest-0094', 'third-0094']) who, generate_series(1, 3) n;

create or replace function tests.convoy_squad(p_who text) returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from public.card_inventory where season = 'S_TEST_CONVOY' and discord_id = p_who
$$;

-- === the host opens a convoy ================================================
create temporary table convoy_host on commit drop as
  select * from public.launch_expedition('host-0094', 'S_TEST_CONVOY', 'raid', tests.convoy_squad('host-0094'), 12, 24,
                                         2, false, 0, 0, null, null, 'new');

select is(length((select convoy_code from convoy_host)), 6, 'a convoy launch hands back a six-character code');
select is(
  (select count(*) from public.expedition_convoys where host_id = 'host-0094')::int, 1,
  'and opens the convoy');
select is(
  (select convoy from public.expedition_runs where id = (select run_id from convoy_host)),
  (select id from public.expedition_convoys where host_id = 'host-0094'),
  'the host''s run is on it');

-- === joining =================================================================
select throws_ok($$
  select * from public.launch_expedition('guest-0094', 'S_TEST_CONVOY', 'raid', tests.convoy_squad('guest-0094'), 12, 24,
                                         2, false, 0, 0, null, null, 'NOPE99') $$,
  'P0001', 'no such convoy', 'a wrong code is refused');
select throws_ok($$
  select * from public.launch_expedition('host-0094', 'S_TEST_CONVOY', 'scout', tests.convoy_squad('host-0094'), 12, 8,
                                         1, false, 0, 0, null, null, (select convoy_code from convoy_host)) $$,
  'P0001', 'cannot join your own convoy', 'the host cannot join their own');
select throws_ok($$
  select * from public.launch_expedition('guest-0094', 'S_TEST_CONVOY', 'scout', tests.convoy_squad('guest-0094'), 12, 8,
                                         1, false, 0, 0, null, null, (select convoy_code from convoy_host)) $$,
  'P0001', 'convoy is another route', 'a convoy is one route');
select is(
  (select count(*) from public.expedition_runs where discord_id = 'guest-0094')::int, 0,
  'a refused join writes no run');

create temporary table convoy_guest on commit drop as
  select * from public.launch_expedition('guest-0094', 'S_TEST_CONVOY', 'raid', tests.convoy_squad('guest-0094'), 12, 24,
                                         2, false, 0, 0, null, null, (select convoy_code from convoy_host));

select is(
  (select started_at from public.expedition_runs where id = (select run_id from convoy_guest)),
  (select started_at from public.expedition_runs where id = (select run_id from convoy_host)),
  'the partner''s run starts on the host''s clock');
select is(
  (select resolves_at from convoy_guest),
  (select resolves_at from public.expedition_runs where id = (select run_id from convoy_host)),
  'and ends with it');
select is(
  (select guest_run from public.expedition_convoys where host_id = 'host-0094'),
  (select run_id from convoy_guest),
  'the convoy records the partner');

select throws_ok($$
  select * from public.launch_expedition('third-0094', 'S_TEST_CONVOY', 'raid', tests.convoy_squad('third-0094'), 12, 24,
                                         2, false, 0, 0, null, null, (select convoy_code from convoy_host)) $$,
  'P0001', 'convoy is full', 'a convoy is two squads');

-- === too late ==================================================================
update public.expedition_runs
  set started_at = now() - interval '9 hours', resolves_at = now() + interval '15 hours'
  where id = (select run_id from convoy_host);
update public.expedition_convoys set guest_id = null, guest_run = null where host_id = 'host-0094';
select throws_ok($$
  select * from public.launch_expedition('third-0094', 'S_TEST_CONVOY', 'raid', tests.convoy_squad('third-0094'), 12, 24,
                                         2, false, 0, 0, null, null, (select convoy_code from convoy_host)) $$,
  'P0001', 'convoy has moved on', 'nobody joins once the first fork is open');

select * from finish();
rollback;
