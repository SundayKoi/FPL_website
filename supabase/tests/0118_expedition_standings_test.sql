-- Expedition standings (20261013000001): the season scored off claimed
-- runs, and the three marks the close awards — once.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

-- === fixture: two collectors ================================================
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0118'::uuid, 'stand-a', 'Stand A'),
  ('00000000-0000-0000-0000-0000000f0118'::uuid, 'stand-b', 'Stand B');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('stand-a', '00000000-0000-0000-0000-0000000e0118'::uuid, 'Ann', 5000),
  ('stand-b', '00000000-0000-0000-0000-0000000f0118'::uuid, 'Bo', 5000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select who, 'S_TEST_ST', who || '-' || n, 'Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', who || '-' || n)
from generate_series(1, 3) n, (values ('stand-a'), ('stand-b')) w(who);

create or replace function tests.st_squad(p_who text) returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_ST' and discord_id = p_who
$$;

create or replace function tests.st_run(p_who text, p_tier text) returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = p_who and tier = p_tier and season = 'S_TEST_ST'
  order by id desc limit 1
$$;

-- Ann: a raid (2 miles, 260) with a rival beaten, and a Legendary route
-- everyone came home from (4 miles, 900). Bo: a Legendary route that
-- lost a card (4 miles, 1200) — more loot, no homecoming.
create temporary table st_a1 on commit drop as
  select * from public.launch_expedition('stand-a', 'S_TEST_ST', 'raid', tests.st_squad('stand-a'), 14, 24, 2, false, 0, 0, null, null, null);
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.st_run('stand-a', 'raid');
select public.resolve_expedition('stand-a', tests.st_run('stand-a', 'raid'), jsonb_build_object(
  'grade', 'solid', 'dollars', 260, 'comp', false,
  'rivals', jsonb_build_array(jsonb_build_object('who', 'stand-b', 'name', 'Bo', 'runId', 1, 'won', true), jsonb_build_object('who', 'stand-b', 'name', 'Bo', 'runId', 2, 'won', false)),
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', 'home')) from unnest(tests.st_squad('stand-a')) id)));

-- The standings before any Legendary run.
select is((select miles from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 2,
  'a raid is two miles walked');
select is((select loot from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 260::bigint,
  'and its dollars are the loot');
select is((select rivals_beaten from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 1,
  'one rival beaten, one not');
select is((select survivals from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 0,
  'no Legendary homecoming yet');
select is((select username from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 'Ann',
  'the row carries the username');

-- A hold (tier lost) and an unclaimed run count for nothing.
insert into public.expedition_supplies (discord_id, fragments) values ('stand-a', 3), ('stand-b', 3)
  on conflict on constraint expedition_supplies_pkey do update set fragments = 3;
create temporary table st_a2 on commit drop as
  select * from public.launch_expedition('stand-a', 'S_TEST_ST', 'legendary', tests.st_squad('stand-a'), 30, 72, 4, false, 0, 3, null, null, null);
select is((select miles from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 2,
  'a run still out is not walked yet');
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.st_run('stand-a', 'legendary');
select public.resolve_expedition('stand-a', tests.st_run('stand-a', 'legendary'), jsonb_build_object(
  'grade', 'jackpot', 'dollars', 900, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', case when id = (tests.st_squad('stand-a'))[1] then 'wounded' else 'home' end)) from unnest(tests.st_squad('stand-a')) id)));

create temporary table st_b1 on commit drop as
  select * from public.launch_expedition('stand-b', 'S_TEST_ST', 'legendary', tests.st_squad('stand-b'), 30, 72, 4, false, 0, 3, null, null, null);
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.st_run('stand-b', 'legendary');
select public.resolve_expedition('stand-b', tests.st_run('stand-b', 'legendary'), jsonb_build_object(
  'grade', 'jackpot', 'dollars', 1200, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', case when id = (tests.st_squad('stand-b'))[1] then 'lost' else 'home' end)) from unnest(tests.st_squad('stand-b')) id)));

select is((select survivals from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 1,
  'a Legendary route with everyone home (wounded counts) is a homecoming');
select is((select survivals from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-b'), 0,
  'one lost is not');
select is((select miles from public.expedition_standings where season = 'S_TEST_ST' and discord_id = 'stand-a'), 6,
  'miles add up across routes');

-- === the close ===============================================================
select is((select count(*) from public.close_expedition_season('S_TEST_ST')), 3::bigint,
  'the close awards the three marks');
select is((select discord_id from public.expedition_accolades where season = 'S_TEST_ST' and kind = 'pathfinder'), 'stand-a',
  'Pathfinder to the most miles');
select is((select discord_id from public.expedition_accolades where season = 'S_TEST_ST' and kind = 'plunderer'), 'stand-b',
  'Plunderer to the most loot');
select is((select discord_id || ':' || value from public.expedition_accolades where season = 'S_TEST_ST' and kind = 'survivor'), 'stand-a:1',
  'Survivor to the most Legendary homecomings, with the number');

-- Closing again changes nothing, whatever happened since.
update public.expedition_runs set outcome = outcome || '{"dollars": 99999}'::jsonb where id = tests.st_run('stand-a', 'raid');
select public.close_expedition_season('S_TEST_ST');
select is((select discord_id from public.expedition_accolades where season = 'S_TEST_ST' and kind = 'plunderer'), 'stand-b',
  'a season closes once');

select * from finish();
rollback;
