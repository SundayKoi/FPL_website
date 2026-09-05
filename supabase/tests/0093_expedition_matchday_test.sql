-- Expeditions — the match-day surge's ceiling and the moment's echo.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0093'::uuid, 'echo-0093', 'Echo Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('echo-0093', '00000000-0000-0000-0000-0000000e0093'::uuid, 'Echo Owner', 100);

-- Two player cards and one moment on the shelf.
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'echo-0093', 'S_TEST_ECHO', 'echo-' || n, 'Echo Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false, jsonb_build_object('slug', 'echo-' || n)
from generate_series(1, 2) n;
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('echo-0093', 'S_TEST_ECHO', 'moment-93', 'Echo Player 1', 'Mid',
        date '2026-08-24', 0, 'moment', false,
        jsonb_build_object('slug', 'moment-93', 'moment', jsonb_build_object('id', 93, 'weekStart', '2026-08-24')));

-- The edition the moment's game was in.
insert into public.card_editions (season, edition_week, slug, player_name, role, overall, tier, card)
values ('S_TEST_ECHO', '2026-08-24', 'echo-rival', 'Rival Player', 'Top', 77, 'gold',
        jsonb_build_object('slug', 'echo-rival', 'name', 'Rival Player', 'teamName', 'Rivals'));

create or replace function tests.echo_card(p_slug text) returns bigint
language sql stable as $$ select id from public.card_inventory where season = 'S_TEST_ECHO' and slug = p_slug $$;

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks)
values ('echo-0093', 'S_TEST_ECHO', 'raid',
        array[tests.echo_card('echo-1'), tests.echo_card('echo-2'), tests.echo_card('moment-93')], 20, now() - interval '1 minute', 2);

create or replace function tests.echo_run() returns bigint
language sql stable as $$ select id from public.expedition_runs where discord_id = 'echo-0093' and tier = 'raid' $$;

-- === the rulebook version ===================================================
select has_column('public', 'expedition_runs', 'rules', 'a run records the rulebook it launched under');
select is((select rules from public.expedition_runs where id = tests.echo_run()), 2::smallint,
  'a launch from here on is under the trail rules');

-- === the ceiling ============================================================
select throws_ok($$
  select * from public.resolve_expedition('echo-0093', tests.echo_run(), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 13576, 'comp', false, 'fates', '[]'::jsonb)) $$,
  'P0001', 'payout out of range', 'the ceiling stops one dollar above the surged maximum');
select throws_ok($$
  select * from public.resolve_expedition('echo-0093', tests.echo_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'surge', 'Rivals', 'fates', '[]'::jsonb)) $$,
  'P0001', 'bad surge', 'the surge is a list of teams');

-- === the echo ===============================================================
select throws_ok($$
  select * from public.resolve_expedition('echo-0093', tests.echo_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'fates', '[]'::jsonb,
    'echo', jsonb_build_object('slug', 'echo-rival', 'week', '2026-08-24', 'moment', tests.echo_card('echo-1')))) $$,
  'P0001', 'echo needs a moment', 'only a moment can echo');
select throws_ok($$
  select * from public.resolve_expedition('echo-0093', tests.echo_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'fates', '[]'::jsonb,
    'echo', jsonb_build_object('slug', 'nobody', 'week', '2026-08-24', 'moment', tests.echo_card('moment-93')))) $$,
  'P0001', 'no such echo', 'an echo needs an archived edition card');

create temporary table echo_claim on commit drop as
  select * from public.resolve_expedition('echo-0093', tests.echo_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 100, 'comp', false, 'fates', '[]'::jsonb, 'surge', '["Rivals"]'::jsonb,
    'echo', jsonb_build_object('slug', 'echo-rival', 'week', '2026-08-24', 'moment', tests.echo_card('moment-93'))));

select is((select balance from echo_claim), 200::bigint, 'the run pays');
select isnt((select echo_id from echo_claim), null, 'and the echo names the minted copy');
select is(
  (select slug from public.card_inventory where id = (select echo_id from echo_claim)), 'echo-rival',
  'the echo is a copy of the edition card');
select is(
  (select (card -> 'echo' ->> 'moment')::bigint from public.card_inventory where id = (select echo_id from echo_claim)),
  tests.echo_card('moment-93'),
  'stamped with the moment it echoed from');
select is(
  (select print_number from public.card_inventory where id = (select echo_id from echo_claim)), 1,
  'and numbered like any print');

select * from finish();
rollback;
