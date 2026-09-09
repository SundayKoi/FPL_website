-- Expedition roads (20261009000001): the five role calls are words the
-- fork RPC now takes, and every new launch is stamped with the road
-- rulebook. Everything else in that release is app-side and derived; the
-- law it leans on is that these two things hold in the database.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

grant usage on schema tests to anon, authenticated;

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0114'::uuid, 'road-0114', 'Road Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('road-0114', '00000000-0000-0000-0000-0000000e0114'::uuid, 'Road Owner', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'road-0114', 'S_TEST_RD', 'rd-' || n, 'Road Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'rd-' || n, 'name', 'Road Player ' || n)
from generate_series(1, 3) n;

create or replace function tests.rd_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_RD' and slug = p_slug
$$;

create or replace function tests.rd_run() returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'road-0114' and tier <> 'lost'
  order by id limit 1
$$;

-- === 1-2. the rulebook ======================================================

select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'expedition_runs' and column_name = 'rules'),
  '3',
  'a launch from here on is stamped with the road rulebook');

create temporary table rd_launch on commit drop as
  select * from public.launch_expedition('road-0114', 'S_TEST_RD', 'raid',
    array[tests.rd_card('rd-1'), tests.rd_card('rd-2'), tests.rd_card('rd-3')], 14, 24, 2, false, 0, 0, null, null, null);

select is((select rules from public.expedition_runs where id = tests.rd_run()), 3::smallint,
  'a fresh run walks a drawn road');

-- === 3-10. the fork takes every call ========================================
-- Nine hours into a 24h raid: the first fork (8h) is open.
update public.expedition_runs
  set started_at = now() - interval '9 hours', resolves_at = now() + interval '15 hours'
  where id = tests.rd_run();

select throws_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'sprint') $$,
  'P0001', 'unknown choice', 'an invented word is still refused');

-- Each role call is a word the RPC accepts. The window rule ("answered
-- once") means each is tried on a cleared sheet.
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'hold') $$,
  'a Top can hold');
update public.expedition_runs set choices = '[]'::jsonb where id = tests.rd_run();
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'scout') $$,
  'a Jungle can scout');
update public.expedition_runs set choices = '[]'::jsonb where id = tests.rd_run();
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'roam') $$,
  'a Mid can roam');
update public.expedition_runs set choices = '[]'::jsonb where id = tests.rd_run();
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'kite') $$,
  'a Bot can kite');
update public.expedition_runs set choices = '[]'::jsonb where id = tests.rd_run();
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'ward') $$,
  'a Support can ward');

select is(
  (select choices -> 0 ->> 'choice' from public.expedition_runs where id = tests.rd_run()), 'ward',
  'the call is recorded as the word it was');

-- The five old words still work — the road added, it did not replace.
update public.expedition_runs set choices = '[]'::jsonb where id = tests.rd_run();
select lives_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'rally') $$,
  'the prints'' own calls are still taken');

-- === 11-12. the law is unchanged around it ==================================
-- Whether THIS squad may make THIS call is the app's check
-- (decideForkFor → choiceAllowed), exactly as favour/light/rally always
-- were; the RPC's job is the window and the once. Both still hold.
select throws_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 0, 'hold') $$,
  'P0001', 'fork already decided', 'a fork is answered once, whatever the word');
select throws_ok(
  $$ select * from public.decide_expedition_fork('road-0114', tests.rd_run(), 1, 'hold') $$,
  'P0001', 'fork not open', 'the window still gates every word');

select * from finish();
rollback;
