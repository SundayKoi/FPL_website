-- Expeditions: no daily launch limit — one run out per tier is the ceiling.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0102'::uuid, 'many-0102', 'Launcher');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('many-0102', '00000000-0000-0000-0000-0000000e0102'::uuid, 'Launcher', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'many-0102', 'S_TEST_MANY', 'many-' || n, 'Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'many-' || n)
from generate_series(1, 9) n;

create or replace function tests.many_squad(p_from int) returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from (
    select id from public.card_inventory where season = 'S_TEST_MANY' order by id offset p_from - 1 limit 3
  ) s
$$;

select lives_ok($$
  select * from public.launch_expedition('many-0102', 'S_TEST_MANY', 'scout', tests.many_squad(1), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'a first launch goes out');
select lives_ok($$
  select * from public.launch_expedition('many-0102', 'S_TEST_MANY', 'raid', tests.many_squad(4), 12, 24, 2, false, 0, 0, null, null, null) $$,
  'a second launch the same day, another tier, goes out too');
select is(
  (select count(*) from public.expedition_runs where discord_id = 'many-0102')::int, 2,
  'both runs are in the field');
select throws_ok($$
  select * from public.launch_expedition('many-0102', 'S_TEST_MANY', 'scout', tests.many_squad(7), 9, 8, 1, false, 0, 0, null, null, null) $$,
  'P0001', 'tier already out', 'but a tier with a run still out is the ceiling that stays');

select * from finish();
rollback;
