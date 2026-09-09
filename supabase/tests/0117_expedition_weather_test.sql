-- Expedition weather (20261012000001): every new launch is stamped with
-- the weather rulebook, and the payout ceiling follows the Harvest
-- merchant — 16350, which is maxExpeditionPayout() in config.ts.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0117'::uuid, 'weather-0117', 'Weather Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('weather-0117', '00000000-0000-0000-0000-0000000e0117'::uuid, 'Weather Owner', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'weather-0117', 'S_TEST_WX', 'wx-' || n, 'Weather Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'wx-' || n, 'name', 'Weather Player ' || n)
from generate_series(1, 3) n;

create or replace function tests.wx_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_WX' and slug = p_slug
$$;

create or replace function tests.wx_run() returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'weather-0117' and tier <> 'lost'
  order by id limit 1
$$;

-- === 1-2. the rulebook ======================================================
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'expedition_runs' and column_name = 'rules'),
  '5',
  'a launch from here on is under the weather');

create temporary table wx_launch on commit drop as
  select * from public.launch_expedition('weather-0117', 'S_TEST_WX', 'raid',
    array[tests.wx_card('wx-1'), tests.wx_card('wx-2'), tests.wx_card('wx-3')], 14, 24, 2, false, 0, 0, null, null, null);

select is((select rules from public.expedition_runs where id = tests.wx_run()), 5::smallint,
  'a fresh run is stamped with the weather rulebook');

-- === 3-5. the ceiling =======================================================
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.wx_run();

select throws_ok($$
  select * from public.resolve_expedition('weather-0117', tests.wx_run(), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 16351, 'comp', false, 'fates', '[]'::jsonb)) $$,
  'P0001', 'payout out of range', 'the ceiling stops one dollar above the Harvest maximum');

select lives_ok($$
  select * from public.resolve_expedition('weather-0117', tests.wx_run(), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 16350, 'comp', false, 'fates', '[]'::jsonb)) $$,
  'the Harvest maximum itself is paid');

select is((select balance from public.betting_profiles where discord_id = 'weather-0117'), 17350::bigint,
  'and lands on the balance');

select * from finish();
rollback;
