-- Expedition company (20261011000001): every new launch is stamped with
-- the company rulebook, and the rivals a claim met ride inside the outcome
-- the RPC already stores whole.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0116'::uuid, 'company-0116', 'Company Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('company-0116', '00000000-0000-0000-0000-0000000e0116'::uuid, 'Company Owner', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'company-0116', 'S_TEST_CO', 'co-' || n, 'Company Player ' || n,
       (array['Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'co-' || n, 'name', 'Company Player ' || n)
from generate_series(1, 3) n;

create or replace function tests.co_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_CO' and slug = p_slug
$$;

create or replace function tests.co_run() returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'company-0116' and tier <> 'lost'
  order by id limit 1
$$;

-- === 1-2. the rulebook ======================================================
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'expedition_runs' and column_name = 'rules'),
  '4',
  'a launch from here on has company on the road');

create temporary table co_launch on commit drop as
  select * from public.launch_expedition('company-0116', 'S_TEST_CO', 'raid',
    array[tests.co_card('co-1'), tests.co_card('co-2'), tests.co_card('co-3')], 14, 24, 2, false, 0, 0, null, null, null);

select is((select rules from public.expedition_runs where id = tests.co_run()), 4::smallint,
  'a fresh run is stamped with the company rulebook');

-- === 3-5. the rivals met ride inside the outcome ============================
update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.co_run();

select lives_ok($$
  select * from public.resolve_expedition('company-0116', tests.co_run(), jsonb_build_object(
    'grade', 'solid', 'dollars', 260, 'comp', false,
    'rivals', jsonb_build_array(jsonb_build_object('who', 'somebody-else', 'name', 'Somebody', 'runId', 99, 'won', true)),
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.co_card('co-1'), 'fate', 'home'),
      jsonb_build_object('id', tests.co_card('co-2'), 'fate', 'home'),
      jsonb_build_object('id', tests.co_card('co-3'), 'fate', 'home')))) $$,
  'a claim that names its rivals is taken');

select is((select outcome -> 'rivals' -> 0 ->> 'who' from public.expedition_runs where id = tests.co_run()), 'somebody-else',
  'and the rival is stored with the outcome');
select is((select (outcome -> 'rivals' -> 0 ->> 'won')::boolean from public.expedition_runs where id = tests.co_run()), true,
  'with the verdict');

select * from finish();
rollback;
