-- The Dribb card: five, numbered, never dusted, never lost.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(8);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0105'::uuid, 'dribb-0105', 'Finder');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('dribb-0105', '00000000-0000-0000-0000-0000000e0105'::uuid, 'Finder', 1000);

create or replace function tests.dribb_json(p_number int) returns jsonb
language sql immutable as $$
  select jsonb_build_object('slug', 'dribb', 'name', 'Dribb', 'overall', 99,
    'dribb', jsonb_build_object('number', p_number, 'of', 5))
$$;

-- === 1-2. the first copy mints, and provenance remembers what it is ======
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('dribb-0105', 'S_TEST_DRIBB', 'dribb', 'Dribb', 'Mid', date '2026-08-24', 99, 'dribb', false, tests.dribb_json(1));

select is(
  (select count(*) from public.card_inventory where card ? 'dribb' and season = 'S_TEST_DRIBB')::int, 1,
  'Dribb #1 is in the collection');
select is(
  (select (print ->> 'dribb')::boolean from public.card_provenance p
     join public.card_inventory ci on ci.id = p.inventory_id
    where ci.season = 'S_TEST_DRIBB' and p.event = 'minted' limit 1), true,
  'the minted print says it is the Dribb card');

-- === 3-4. five, numbered =================================================
select throws_ok($$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('dribb-0105', 'S_TEST_DRIBB', 'dribb', 'Dribb', 'Mid', date '2026-08-24', 99, 'dribb', false, tests.dribb_json(1)) $$,
  '23505', null, 'a second #1 is refused by the index');
select throws_ok($$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values ('dribb-0105', 'S_TEST_DRIBB', 'dribb', 'Dribb', 'Mid', date '2026-08-24', 99, 'dribb', false, tests.dribb_json(6)) $$,
  '23514', null, 'a #6 is refused by the check');

-- === 5-6. never dusted ===================================================
select throws_ok(
  format($$ select public.dust_card('dribb-0105', %s, 100) $$,
    (select id from public.card_inventory where season = 'S_TEST_DRIBB' and card ? 'dribb')),
  'P0001', 'dribb cannot be dusted', 'dust_card refuses it');
select is(
  (select count(*) from public.card_inventory where season = 'S_TEST_DRIBB' and card ? 'dribb')::int, 1,
  'and the copy is still there');

-- === 7-8. never on a route that can lose it ==============================
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'dribb-0105', 'S_TEST_DRIBB', 'mate-' || n, 'Mate ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'mate-' || n)
from generate_series(1, 2) n;

create or replace function tests.dribb_squad() returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from public.card_inventory where season = 'S_TEST_DRIBB'
$$;

select throws_ok($$
  select * from public.launch_expedition('dribb-0105', 'S_TEST_DRIBB', 'legend', tests.dribb_squad(), 30, 48, 3, false, 0, 0, null, null, null) $$,
  'P0001', 'card is one of one', 'a Legend Hunt refuses a squad carrying it');
select lives_ok($$
  select * from public.launch_expedition('dribb-0105', 'S_TEST_DRIBB', 'raid', tests.dribb_squad(), 30, 24, 2, false, 0, 0, null, null, null) $$,
  'a Deep Raid, which can only wound, takes it');

select * from finish();
rollback;
