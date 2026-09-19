-- The On Air card: the casters' settings, numbered per caster per season,
-- never dusted, never lost.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

insert into public.profiles (id, discord_id, display_name, is_broadcaster)
values ('00000000-0000-0000-0000-0000000e0124'::uuid, 'onair-0124', 'Collector', false),
       ('00000000-0000-0000-0000-0000000e1240'::uuid, 'caster-a-0124', 'Caster A', true),
       ('00000000-0000-0000-0000-0000000e1241'::uuid, 'caster-b-0124', 'Caster B', true);
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('onair-0124', '00000000-0000-0000-0000-0000000e0124'::uuid, 'Collector', 1000);

-- === 1-2. the casters' settings, and everybody can read them =============
-- Not a secret: the rarities page, the shop's live notice and the admin
-- desk all draw off this table, and the anon client is what serves them.
insert into public.on_air_casters (profile_id, champion, skin, role_label, tagline)
values ('00000000-0000-0000-0000-0000000e1240'::uuid, 'Bard', 3, 'Play-by-play', 'Chimes on the three.');

select is(
  (select role_label from public.on_air_casters where profile_id = '00000000-0000-0000-0000-0000000e1240'::uuid),
  'Play-by-play', 'a caster''s settings row is stored');

set local role anon;
select is(
  (select champion from public.on_air_casters where profile_id = '00000000-0000-0000-0000-0000000e1240'::uuid),
  'Bard', 'an anonymous reader sees it');
reset role;

create or replace function tests.on_air_json(p_profile uuid, p_name text, p_number int) returns jsonb
language sql immutable as $$
  select jsonb_build_object('slug', 'on-air-' || lower(p_name), 'name', p_name, 'overall', 100,
    'onAir', jsonb_build_object(
      'profileId', p_profile::text, 'name', p_name,
      'number', p_number, 'of', 25, 'window', 'Match night rip'))
$$;

-- === 3-4. the first copy mints, and provenance remembers what it is ======
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('onair-0124', 'S_TEST_ONAIR', 'on-air-caster a', 'Caster A', 'Play-by-play', date '2026-08-24', 100, 'onair', false,
        tests.on_air_json('00000000-0000-0000-0000-0000000e1240'::uuid, 'Caster A', 1));

select is(
  (select count(*) from public.card_inventory where card ? 'onAir' and season = 'S_TEST_ONAIR')::int, 1,
  'On Air #1 is in the collection');
select is(
  (select (print ->> 'onAir')::boolean from public.card_provenance p
     join public.card_inventory ci on ci.id = p.inventory_id
    where ci.season = 'S_TEST_ONAIR' and p.event = 'minted' limit 1), true,
  'the minted print says it is an On Air card');

-- === 5-7. twenty-five a caster a season, numbered ========================
select throws_ok($$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('onair-0124', 'S_TEST_ONAIR', 'on-air-caster a', 'Caster A', 'Play-by-play', date '2026-08-24', 100, 'onair', false,
          tests.on_air_json('00000000-0000-0000-0000-0000000e1240'::uuid, 'Caster A', 1)) $$,
  '23505', null, 'a second #1 for the same caster and season is refused by the index');

select lives_ok($$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('onair-0124', 'S_TEST_ONAIR', 'on-air-caster b', 'Caster B', 'Colour', date '2026-08-24', 100, 'onair', false,
          tests.on_air_json('00000000-0000-0000-0000-0000000e1241'::uuid, 'Caster B', 1)) $$,
  'the OTHER caster''s #1 in the same season is fine');

select throws_ok($$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('onair-0124', 'S_TEST_ONAIR', 'on-air-caster a', 'Caster A', 'Play-by-play', date '2026-08-24', 100, 'onair', false,
          tests.on_air_json('00000000-0000-0000-0000-0000000e1240'::uuid, 'Caster A', 26)) $$,
  '23514', null, 'a #26 is refused by the check');

-- === 8-9. never dusted ===================================================
select throws_ok(
  format($$ select public.dust_card('onair-0124', %s, 100) $$,
    (select min(id) from public.card_inventory where season = 'S_TEST_ONAIR' and card ? 'onAir')),
  'P0001', 'on air cannot be dusted', 'dust_card refuses it');
select is(
  (select count(*) from public.card_inventory where season = 'S_TEST_ONAIR' and card ? 'onAir')::int, 2,
  'and both copies are still there');

-- === 10-11. never on a route that can lose it ============================
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'onair-0124', 'S_TEST_ONAIR', 'mate-' || n, 'Mate ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'mate-' || n)
from generate_series(1, 2) n;

create or replace function tests.on_air_squad() returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from (
    (select id from public.card_inventory
       where season = 'S_TEST_ONAIR' and card ? 'onAir' order by id limit 1)
    union all
    (select id from public.card_inventory
       where season = 'S_TEST_ONAIR' and not (card ? 'onAir') order by id limit 2)
  ) s
$$;

select throws_ok($$
  select * from public.launch_expedition('onair-0124', 'S_TEST_ONAIR', 'legend', tests.on_air_squad(), 30, 48, 3, false, 0, 0, null, null, null) $$,
  'P0001', 'card is one of one', 'a Legend Hunt refuses a squad carrying it');
select lives_ok($$
  select * from public.launch_expedition('onair-0124', 'S_TEST_ONAIR', 'scout', tests.on_air_squad(), 30, 12, 0, false, 0, 0, null, null, null) $$,
  'a Scout, which can lose nothing, takes it');

select * from finish();
rollback;
