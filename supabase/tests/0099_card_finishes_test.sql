-- Finishes, part two — a copy wears its history, a slab seals it, and a
-- StatTrak count is one owner's.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(19);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0099'::uuid, 'wear-0099', 'Wearer'),
       ('00000000-0000-0000-0000-0000000e0100'::uuid, 'next-0099', 'Next');
insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('wear-0099', '00000000-0000-0000-0000-0000000e0099'::uuid, 'Wearer', 1000),
       ('next-0099', '00000000-0000-0000-0000-0000000e0100'::uuid, 'Next', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'wear-0099', 'S_TEST_WEAR', 'wear-' || n, 'Wear Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'wear-' || n) || case when n = 1 then '{"stattrak":{"points":0,"since":"2026-08-24T00:00:00.000Z"}}'::jsonb else '{}'::jsonb end
from generate_series(1, 4) n;

create or replace function tests.wear_id(p_n int) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_WEAR' and slug = 'wear-' || p_n
$$;
create or replace function tests.wear_of(p_n int) returns int
language sql stable as $$
  select coalesce((card ->> 'wear')::int, 0) from public.card_inventory where id = tests.wear_id(p_n)
$$;

-- === wear ===================================================================
select has_function('public', 'wear_cards', array['bigint[]'], 'wear_cards exists');
select is(public.wear_cards(array[tests.wear_id(1), tests.wear_id(2)]), 2, 'wear_cards touches every id it is given');
select is(tests.wear_of(1), 1, 'and a fielded copy wears one');
select is(tests.wear_of(3), 0, 'a copy left home wears nothing');

-- A launch is a fielding: the squad wears it in the same transaction.
select lives_ok($$
  select * from public.launch_expedition('wear-0099', 'S_TEST_WEAR', 'scout',
    array[tests.wear_id(1), tests.wear_id(2), tests.wear_id(3)], 9, 8, 1, false, 0, 0, null, null, null) $$,
  'a squad launches');
select is(tests.wear_of(1), 2, 'and every card in it wears one more');
update public.expedition_runs set claimed_at = now() where season = 'S_TEST_WEAR';

-- === slabbing ===============================================================
select has_function('public', 'slab_card', array['text', 'bigint'], 'slab_card exists');
select throws_ok($$ select public.slab_card('next-0099', tests.wear_id(4)) $$, 'P0001', 'card not owned',
  'only the owner can slab a copy');
select is((public.slab_card('wear-0099', tests.wear_id(4)) ->> 'wear')::int, 0, 'a slab freezes the wear the copy had');
select throws_ok($$ select public.slab_card('wear-0099', tests.wear_id(4)) $$, 'P0001', 'card already slabbed',
  'and cannot be slabbed twice');
select is(public.wear_cards(array[tests.wear_id(4)]), 0, 'a slabbed copy never wears');
select throws_ok($$
  update public.card_inventory set card = card - 'slab' where id = tests.wear_id(4) $$,
  'P0001', 'card is slabbed', 'and the slab cannot be taken off');
select throws_ok($$
  select * from public.launch_expedition('wear-0099', 'S_TEST_WEAR', 'scout',
    array[tests.wear_id(2), tests.wear_id(3), tests.wear_id(4)], 9, 8, 1, false, 0, 0, null, null, null) $$,
  'P0001', 'card is slabbed', 'a slabbed copy cannot go on an expedition');

-- === StatTrak ===============================================================
select ok(public.bump_stattrak(tests.wear_id(1), 71.5, '2026-08-25T02:00:00Z'), 'a game''s points land on a StatTrak copy');
select is((select (card -> 'stattrak' ->> 'points')::numeric from public.card_inventory where id = tests.wear_id(1)), 71.5::numeric,
  'and are counted');
select ok(not public.bump_stattrak(tests.wear_id(1), 71.5, '2026-08-25T02:00:00Z'), 'the same games do not count twice');
select ok(not public.bump_stattrak(tests.wear_id(1), 10, '2026-08-20T02:00:00Z'), 'nor do games before the last counted');
select ok(not public.bump_stattrak(tests.wear_id(2), 50, '2026-08-25T02:00:00Z'), 'a copy without the counter takes nothing');
update public.card_inventory set discord_id = 'next-0099' where id = tests.wear_id(1);
select is((select (card -> 'stattrak' ->> 'points')::numeric from public.card_inventory where id = tests.wear_id(1)), 0::numeric,
  'a transfer zeroes the count for the new owner');

select * from finish();
rollback;
