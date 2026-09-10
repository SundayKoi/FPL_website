-- The Mythic route (20261015000001): the tier the launch and the claim
-- now know, its two gates, the Voidborn stamp that replaces Voidtouched,
-- a death past the rift, and the ceiling that follows its jackpot.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(13);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0120'::uuid, 'myth-0120', 'Myth Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('myth-0120', '00000000-0000-0000-0000-0000000e0120'::uuid, 'Myth Owner', 5000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'myth-0120', 'S_TEST_MY', 'my-' || n, 'Myth Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'my-' || n, 'name', 'Myth Player ' || n)
from generate_series(1, 3) n;

insert into public.expedition_supplies (discord_id, fragments) values ('myth-0120', 9)
  on conflict on constraint expedition_supplies_pkey do update set fragments = 9;

create or replace function tests.my_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_MY' and slug = p_slug
$$;

create or replace function tests.my_squad() returns bigint[]
language sql stable as $$
  select array_agg(id order by slug) from public.card_inventory where season = 'S_TEST_MY' and discord_id = 'myth-0120'
$$;

create or replace function tests.my_run() returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'myth-0120' and tier = 'mythic' order by id desc limit 1
$$;

-- === 1. miles ================================================================
select is(public.expedition_trail_miles('mythic'), 5, 'the Mythic route is five miles');

-- === 2-4. the gates ==========================================================
select throws_ok($$
  select * from public.launch_expedition('myth-0120', 'S_TEST_MY', 'mythic', tests.my_squad(), 30, 96, 5, false, 0, 3, null, null, null) $$,
  'P0001', 'mythic needs a voidtouched card', 'nothing Voidtouched in the squad: refused');

update public.card_inventory set card = jsonb_set(card, '{mutation}', '{"key": "voidtouched", "date": "2026-09-01", "run": 1}'::jsonb)
  where id = tests.my_card('my-1');
select throws_ok($$
  select * from public.launch_expedition('myth-0120', 'S_TEST_MY', 'mythic', tests.my_squad(), 30, 96, 5, false, 0, 3, null, null, null) $$,
  'P0001', 'mythic needs a legend mark', 'no Legend mark on the shelf: refused');

update public.card_inventory set card = jsonb_set(card, '{expedition}', '{"mark": "legend", "tier": "legend", "date": "2026-09-01"}'::jsonb)
  where id = tests.my_card('my-2');
select lives_ok($$
  select * from public.launch_expedition('myth-0120', 'S_TEST_MY', 'mythic', tests.my_squad(), 30, 96, 5, false, 0, 3, null, null, null) $$,
  'a Voidtouched card and a Legend mark open the route');
select is((select fragments from public.expedition_supplies where discord_id = 'myth-0120'), 6, 'and it costs three fragments');

-- === 5-9. the claim ==========================================================
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.my_run();
select throws_ok($$
  select * from public.resolve_expedition('myth-0120', tests.my_run(), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 900, 'comp', false,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.my_card('my-1'), 'fate', 'home'),
      jsonb_build_object('id', tests.my_card('my-2'), 'fate', 'home', 'mutation', 'voidborn'),
      jsonb_build_object('id', tests.my_card('my-3'), 'fate', 'home')))) $$,
  'P0001', 'mutation beyond card', 'Voidborn only ever lands on a Voidtouched card');
select lives_ok($$
  select * from public.resolve_expedition('myth-0120', tests.my_run(), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 900, 'comp', false,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.my_card('my-1'), 'fate', 'home', 'mutation', 'voidborn'),
      jsonb_build_object('id', tests.my_card('my-2'), 'fate', 'home', 'mutation', 'voidtouched'),
      jsonb_build_object('id', tests.my_card('my-3'), 'fate', 'dead')))) $$,
  'a death, a Voidtouched and a Voidborn all come home from the Mythic route');
select is((select mutation from public.card_inventory where id = tests.my_card('my-1')), 'voidborn', 'Voidborn replaced Voidtouched');
select is((select mutation from public.card_inventory where id = tests.my_card('my-2')), 'voidtouched', 'the other survivor is Voidtouched');
select is((select count(*) from public.expedition_graveyard where discord_id = 'myth-0120' and cause = 'route'), 1::bigint, 'the dead card is in the graveyard');
select is((select (card -> 'trail' ->> 'miles')::int from public.card_inventory where id = tests.my_card('my-1')), 5, 'and the survivors walked five miles');

-- === 10-11. Voidborn nowhere else ============================================
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('myth-0120', 'S_TEST_MY', 'my-4', 'Myth Player 4', 'Mid', date '2026-08-24', 80, 'platinum', false,
  '{"slug": "my-4", "mutation": {"key": "voidtouched", "date": "2026-09-01", "run": 1}}'::jsonb);
create temporary table my_raid on commit drop as
  select * from public.launch_expedition('myth-0120', 'S_TEST_MY', 'raid',
    array[tests.my_card('my-1'), tests.my_card('my-2'), tests.my_card('my-4')], 14, 24, 2, false, 0, 0, null, null, null);
update public.expedition_runs set resolves_at = now() - interval '1 minute' where discord_id = 'myth-0120' and tier = 'raid';
select throws_ok($$
  select * from public.resolve_expedition('myth-0120', (select id from public.expedition_runs where discord_id = 'myth-0120' and tier = 'raid'), jsonb_build_object(
    'grade', 'solid', 'dollars', 260, 'comp', false,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.my_card('my-1'), 'fate', 'home'),
      jsonb_build_object('id', tests.my_card('my-2'), 'fate', 'home'),
      jsonb_build_object('id', tests.my_card('my-4'), 'fate', 'home', 'mutation', 'voidborn')))) $$,
  'P0001', 'mutation beyond route', 'a raid cannot make a card Voidborn');

-- === 12. the ceiling ========================================================
select throws_ok($$
  select * from public.resolve_expedition('myth-0120', (select id from public.expedition_runs where discord_id = 'myth-0120' and tier = 'raid'), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 19051, 'comp', false, 'fates', '[]'::jsonb)) $$,
  'P0001', 'payout out of range', 'the ceiling stops one dollar above the Mythic maximum');

select * from finish();
rollback;
