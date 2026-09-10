-- Expedition campaigns (20261014000001): one open campaign at a time,
-- runs bound to the stage they are for, the road handed down, and the
-- finale's relic.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(18);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0119'::uuid, 'camp-0119', 'Camp Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('camp-0119', '00000000-0000-0000-0000-0000000e0119'::uuid, 'Camp Owner', 5000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'camp-0119', 'S_TEST_CP', 'cp-' || n, 'Camp Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'cp-' || n, 'name', 'Camp Player ' || n, 'trail', jsonb_build_object('miles', n, 'runs', 1, 'deepest', 'raid'))
from generate_series(1, 3) n;

create or replace function tests.cp_squad() returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_CP' and discord_id = 'camp-0119' and card -> 'campaign' is null
$$;

create or replace function tests.cp_run(p_tier text) returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'camp-0119' and tier = p_tier and season = 'S_TEST_CP'
  order by id desc limit 1
$$;

create or replace function tests.cp_camp() returns bigint
language sql stable as $$
  select id from public.expedition_campaigns where discord_id = 'camp-0119' and season = 'S_TEST_CP' order by id desc limit 1
$$;

-- === the stages ============================================================
select is(public.expedition_campaign_tier('broken_map', 0), 'scout', 'The Broken Map opens with a Scouting Run');
select is(public.expedition_campaign_tier('lost_print', 2), 'legendary', 'The Lost Print ends on the Legendary route');

-- === start ==================================================================
select lives_ok($$ select public.start_expedition_campaign('camp-0119', 'S_TEST_CP', 'broken_map') $$, 'a campaign opens');
select throws_ok($$ select public.start_expedition_campaign('camp-0119', 'S_TEST_CP', 'lost_print') $$,
  'P0001', 'campaign already open', 'one at a time');
select throws_ok($$ select public.start_expedition_campaign('camp-0119', 'S_TEST_CP', 'treasure') $$,
  'P0001', 'unknown campaign', 'and only the two that exist');

-- === bind ===================================================================
create temporary table cp_raid on commit drop as
  select * from public.launch_expedition('camp-0119', 'S_TEST_CP', 'raid', tests.cp_squad(), 14, 24, 2, false, 0, 0, null, null, null);
select throws_ok($$ select public.bind_expedition_campaign('camp-0119', tests.cp_run('raid'), tests.cp_camp()) $$,
  'P0001', 'wrong route for the stage', 'stage one of The Broken Map is a Scouting Run, not a raid');
-- Clear the raid so the squad is free for the scout.
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.cp_run('raid');
select public.resolve_expedition('camp-0119', tests.cp_run('raid'), jsonb_build_object('grade', 'poor', 'dollars', 40, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', 'home')) from unnest(tests.cp_squad()) id)));

create temporary table cp_scout on commit drop as
  select * from public.launch_expedition('camp-0119', 'S_TEST_CP', 'scout', tests.cp_squad(), 9, 8, 1, false, 0, 0, null, null, null);
select lives_ok($$ select public.bind_expedition_campaign('camp-0119', tests.cp_run('scout'), tests.cp_camp()) $$,
  'a Scouting Run binds to stage one');
select is((select campaign from public.expedition_runs where id = tests.cp_run('scout')), tests.cp_camp(), 'the run knows its campaign');
select is((select road from public.expedition_runs where id = tests.cp_run('scout')), null::jsonb, 'stage one walks its own draw');
select throws_ok($$ select public.bind_expedition_campaign('camp-0119', tests.cp_run('scout'), tests.cp_camp()) $$,
  'P0001', 'stage already out', 'a stage has one run');

-- === advance =================================================================
select throws_ok($$ select public.advance_expedition_campaign('camp-0119', tests.cp_camp(), '["waterworks", "pits"]'::jsonb, '{"grade": "poor"}'::jsonb, null) $$,
  'P0001', 'stage not claimed', 'the stage advances only once its run is claimed');
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.cp_run('scout');
select public.resolve_expedition('camp-0119', tests.cp_run('scout'), jsonb_build_object('grade', 'poor', 'dollars', 40, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', 'home')) from unnest(tests.cp_squad()) id)));
select is((select stage from public.advance_expedition_campaign('camp-0119', tests.cp_camp(), '["waterworks", "pits"]'::jsonb, '{"grade": "poor"}'::jsonb, null)), 1::smallint,
  'a poor scout: stage two, and the raid opens in the flooded works');

create temporary table cp_raid2 on commit drop as
  select * from public.launch_expedition('camp-0119', 'S_TEST_CP', 'raid', tests.cp_squad(), 14, 24, 2, false, 0, 0, null, null, null);
select public.bind_expedition_campaign('camp-0119', tests.cp_run('raid'), tests.cp_camp());
select is((select road from public.expedition_runs where id = tests.cp_run('raid')), '["waterworks", "pits"]'::jsonb,
  'the raid walks the road the scout set');
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.cp_run('raid');
select public.resolve_expedition('camp-0119', tests.cp_run('raid'), jsonb_build_object('grade', 'jackpot', 'dollars', 700, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', 'home')) from unnest(tests.cp_squad()) id)));
select public.advance_expedition_campaign('camp-0119', tests.cp_camp(), '["chapel", "belltower", "vault"]'::jsonb, '{"grade": "jackpot"}'::jsonb, null);

-- === the finale and the relic ===============================================
create temporary table cp_legend on commit drop as
  select * from public.launch_expedition('camp-0119', 'S_TEST_CP', 'legend', tests.cp_squad(), 20, 48, 3, false, 0, 0, null, null, null);
select public.bind_expedition_campaign('camp-0119', tests.cp_run('legend'), tests.cp_camp());
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.cp_run('legend');
select public.resolve_expedition('camp-0119', tests.cp_run('legend'), jsonb_build_object('grade', 'solid', 'dollars', 500, 'comp', false,
  'fates', (select jsonb_agg(jsonb_build_object('id', id, 'fate', 'home')) from unnest(tests.cp_squad()) id)));
select throws_ok($$ select public.advance_expedition_campaign('camp-0119', tests.cp_camp(), null, '{"grade": "solid"}'::jsonb, 999999) $$,
  'P0001', 'relic not in squad', 'the relic is printed off a card that walked the finale');
select is((select finished_at is not null from public.advance_expedition_campaign('camp-0119', tests.cp_camp(), null, '{"grade": "solid"}'::jsonb, (tests.cp_squad())[3])), true,
  'the third claim finishes the campaign');
select is((select card -> 'campaign' ->> 'key' from public.card_inventory where id = (select relic from public.expedition_campaigns where id = tests.cp_camp())), 'broken_map',
  'and mints the relic in the campaign''s frame');
select is((select count(*) from public.card_inventory where discord_id = 'camp-0119' and season = 'S_TEST_CP'), 4::bigint,
  'a fourth card on the shelf, the original untouched');
-- A new one can open now.
select lives_ok($$ select public.start_expedition_campaign('camp-0119', 'S_TEST_CP', 'lost_print') $$, 'a finished campaign makes room for the next');

select * from finish();
rollback;
