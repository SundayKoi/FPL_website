-- Expeditions: the Gilded Road is a patron route.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0103'::uuid, 'plain-0103', 'Plain'),
  ('00000000-0000-0000-0000-0000000f0103'::uuid, 'flame-0103', 'Flame');
insert into public.betting_profiles (discord_id, profile_id, username, balance, patron_until) values
  ('plain-0103', '00000000-0000-0000-0000-0000000e0103'::uuid, 'Plain', 1000, null),
  ('flame-0103', '00000000-0000-0000-0000-0000000f0103'::uuid, 'Flame', 1000, now() + interval '30 days');

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select owner, 'S_TEST_GILD', 'gild-' || owner || '-' || n, 'Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'gild-' || n)
from unnest(array['plain-0103', 'flame-0103']) owner, generate_series(1, 3) n;

create or replace function tests.gild_squad(p_owner text) returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from public.card_inventory
  where season = 'S_TEST_GILD' and discord_id = p_owner
$$;

select throws_ok($$
  select * from public.launch_expedition('plain-0103', 'S_TEST_GILD', 'gilded', tests.gild_squad('plain-0103'), 12, 12, 2, false, 0, 0, null, null, null) $$,
  'P0001', 'patron road', 'without the flame the road is closed');
select is(
  (select count(*) from public.expedition_runs where discord_id = 'plain-0103')::int, 0,
  'and nothing was launched');
select lives_ok($$
  select * from public.launch_expedition('flame-0103', 'S_TEST_GILD', 'gilded', tests.gild_squad('flame-0103'), 12, 12, 2, false, 0, 0, null, null, null) $$,
  'a patron walks it');
select is(
  (select tier from public.expedition_runs where discord_id = 'flame-0103'), 'gilded',
  'the run is stored under its own tier');
select throws_ok($$
  select * from public.launch_expedition('flame-0103', 'S_TEST_GILD', 'gilded', tests.gild_squad('flame-0103'), 12, 12, 2, false, 0, 0, null, null, null) $$,
  'P0001', 'tier already out', 'one Gilded Road out at a time, like every tier');

select * from finish();
rollback;
