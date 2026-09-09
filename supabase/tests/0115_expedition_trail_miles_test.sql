-- Trail miles (20261010000001): the claim stamps the roads a card has
-- walked, and nothing else does. The app reads the stamp for titles that
-- sharpen a role call and add shine, so the stamp has to be the trigger's
-- and the arithmetic has to be exact.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0115'::uuid, 'miles-0115', 'Miles Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('miles-0115', '00000000-0000-0000-0000-0000000e0115'::uuid, 'Miles Owner', 5000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'miles-0115', 'S_TEST_MI', 'mi-' || n, 'Miles Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'mi-' || n, 'name', 'Miles Player ' || n)
from generate_series(1, 3) n;

create or replace function tests.mi_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_MI' and slug = p_slug
$$;

create or replace function tests.mi_run(p_tier text) returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'miles-0115' and tier = p_tier
  order by id desc limit 1
$$;

-- The miles table, held equal to MILES_BY_TIER in src/lib/expeditions/trail.ts.
select is(public.expedition_trail_miles('scout'), 1, 'a scouting run is a mile');
select is(public.expedition_trail_miles('legendary'), 4, 'the Legendary route is four');
select is(public.expedition_trail_miles('exorcism'), 0, 'an exorcism is a rite, not a road');
select is(public.expedition_trail_miles('lost'), 0, 'a hold is not a road either');

-- === a raid comes home: two survivors stamped, one wounded too =============
create temporary table mi_raid on commit drop as
  select * from public.launch_expedition('miles-0115', 'S_TEST_MI', 'raid',
    array[tests.mi_card('mi-1'), tests.mi_card('mi-2'), tests.mi_card('mi-3')], 14, 24, 2, false, 0, 0, null, null, null);
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.mi_run('raid');

select lives_ok($$
  select * from public.resolve_expedition('miles-0115', tests.mi_run('raid'), jsonb_build_object(
    'grade', 'solid', 'dollars', 260, 'comp', false,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.mi_card('mi-1'), 'fate', 'home'),
      jsonb_build_object('id', tests.mi_card('mi-2'), 'fate', 'wounded'),
      jsonb_build_object('id', tests.mi_card('mi-3'), 'fate', 'home', 'mutation', 'hardened')))) $$,
  'the raid is claimed');

select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.mi_card('mi-1')), 2,
  'a card home from a raid has two miles');
select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.mi_card('mi-2')), 2,
  'a wounded card came home too, and has them');
select is((select card -> 'trail' ->> 'deepest' from public.card_inventory where id = tests.mi_card('mi-1')), 'raid',
  'the deepest road is the raid');
select is((select card -> 'mutation' ->> 'key' from public.card_inventory where id = tests.mi_card('mi-3')), 'hardened',
  'the mutation stamped in the same claim survives the trail stamp, and the trail survives it');
select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.mi_card('mi-3')), 2,
  'the hardened card has its miles as well');

-- === a scouting run adds to the count, and the deepest road is kept =========
-- The wounded card is benched; the other two go out again.
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('miles-0115', 'S_TEST_MI', 'mi-4', 'Miles Player 4', 'Mid', date '2026-08-24', 80, 'platinum', false, '{"slug":"mi-4"}'::jsonb);

create temporary table mi_scout on commit drop as
  select * from public.launch_expedition('miles-0115', 'S_TEST_MI', 'scout',
    array[tests.mi_card('mi-1'), tests.mi_card('mi-3'), tests.mi_card('mi-4')], 9, 8, 1, false, 0, 0, null, null, null);
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.mi_run('scout');
select public.resolve_expedition('miles-0115', tests.mi_run('scout'), jsonb_build_object(
  'grade', 'poor', 'dollars', 40, 'comp', false,
  'fates', jsonb_build_array(
    jsonb_build_object('id', tests.mi_card('mi-1'), 'fate', 'home'),
    jsonb_build_object('id', tests.mi_card('mi-3'), 'fate', 'home'),
    jsonb_build_object('id', tests.mi_card('mi-4'), 'fate', 'home'))));

select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.mi_card('mi-1')), 3,
  'the miles add up across runs');
select is((select (card -> 'trail' ->> 'runs')::int from public.card_inventory where id = tests.mi_card('mi-1')), 2,
  'and the runs are counted');
select is((select card -> 'trail' ->> 'deepest' from public.card_inventory where id = tests.mi_card('mi-1')), 'raid',
  'a shallower road after a deeper one does not shrink the deepest');
select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.mi_card('mi-4')), 1,
  'a first-timer has one mile');

select * from finish();
rollback;
