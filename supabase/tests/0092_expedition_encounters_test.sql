-- Expedition encounters — the storm's delay and the stranded card's bounty.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(10);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0092'::uuid, 'enc-0092', 'Encounter Owner'),
       ('00000000-0000-0000-0000-0000000e0093'::uuid, 'lost-0092', 'Lost Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('enc-0092', '00000000-0000-0000-0000-0000000e0092'::uuid, 'Encounter Owner', 100),
       ('lost-0092', '00000000-0000-0000-0000-0000000e0093'::uuid, 'Lost Owner', 100);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'enc-0092', 'S_TEST_ENC', 'enc-' || n, 'Encounter Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'enc-' || n)
from generate_series(1, 3) n;

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('lost-0092', 'S_TEST_ENC', 'enc-lost', 'Lost Player', 'Mid',
        date '2026-08-24', 80, 'platinum', false, '{"slug":"enc-lost"}'::jsonb);

create or replace function tests.enc_card(p_slug text) returns bigint
language sql stable as $$ select id from public.card_inventory where season = 'S_TEST_ENC' and slug = p_slug $$;

-- A Legend Hunt in the field, and another collector's lost card on a hold.
insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks)
values ('enc-0092', 'S_TEST_ENC', 'legend',
        array[tests.enc_card('enc-1'), tests.enc_card('enc-2'), tests.enc_card('enc-3')], 20, now() + interval '10 hours', 3);
insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks)
values ('lost-0092', 'S_TEST_ENC', 'lost', array[tests.enc_card('enc-lost')], 0, now() + interval '6 days', 0);

create or replace function tests.enc_run() returns bigint
language sql stable as $$ select id from public.expedition_runs where discord_id = 'enc-0092' and tier = 'legend' $$;
create or replace function tests.enc_hold() returns bigint
language sql stable as $$ select id from public.expedition_runs where discord_id = 'lost-0092' and tier = 'lost' $$;

select has_column('public', 'expedition_runs', 'encounters', 'runs record their applied encounters');

-- === the storm ==============================================================
create temporary table enc_before on commit drop as select resolves_at from public.expedition_runs where id = tests.enc_run();
create temporary table enc_storm on commit drop as select * from public.delay_expedition(tests.enc_run(), 1, 2);

select is(
  (select resolves_at from enc_storm), (select resolves_at + interval '2 hours' from enc_before),
  'a storm pushes the run out by two hours');
select is(
  (select jsonb_array_length(encounters) from public.expedition_runs where id = tests.enc_run()), 1,
  'and is recorded');

create temporary table enc_again on commit drop as select * from public.delay_expedition(tests.enc_run(), 1, 2);
select is(
  (select resolves_at from enc_again), (select resolves_at from enc_storm),
  'the same storm applied twice delays once');
select throws_ok(
  $$ select * from public.delay_expedition(tests.enc_run(), 2, 40) $$,
  'P0001', 'bad delay', 'a delay is range checked');

-- === the stranded card ======================================================
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.enc_run();

select throws_ok($$
  select * from public.resolve_expedition('enc-0092', tests.enc_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'stranded', 987654321, 'bounty', 150,
    'fates', '[]'::jsonb)) $$,
  'P0001', 'no such stranded card', 'a stranded card must be a real hold');

create temporary table enc_claim on commit drop as
  select * from public.resolve_expedition('enc-0092', tests.enc_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'stranded', tests.enc_hold(), 'bounty', 150,
    'fates', '[]'::jsonb));

select is((select balance from enc_claim), 350::bigint, 'the run pays and the bounty pays on top');
select is(
  (select claimed_at is not null from public.expedition_runs where id = tests.enc_hold()), true,
  'the stranger''s hold is released');
select ok(
  (select (card -> 'wounded' ->> 'until')::timestamptz from public.card_inventory where id = tests.enc_card('enc-lost')) > now(),
  'their card comes home wounded');
select is(
  (select count(*) from public.betting_ledger where discord_id = 'enc-0092' and reason = 'expedition_bounty')::int, 1,
  'the bounty writes its own ledger row');

select * from finish();
rollback;
