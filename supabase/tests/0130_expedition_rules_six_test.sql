-- Expeditions, rules 6 (20261101000001): a launch from here on walks with
-- edges, a run already stamped keeps the rulebook it left under, and the
-- app can ask which rulebook a launch will get. Only the service role can
-- ask: the answer steers a launch, and every launch goes through it.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0130'::uuid, 'rules-0130', 'Rules Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('rules-0130', '00000000-0000-0000-0000-0000000e0130'::uuid, 'Rules Owner', 1000);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'rules-0130', 'S_TEST_R6', 'r6-' || n, 'Rules Player ' || n,
       (array['Top', 'Jungle', 'Support', 'Top', 'Jungle', 'Support'])[n],
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'r6-' || n, 'name', 'Rules Player ' || n, 'archetype', 'Camp Thief')
from generate_series(1, 6) n;

create or replace function tests.r6_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_R6' and slug = p_slug
$$;

-- === 1. a fresh launch walks with edges =====================================
-- Captured rather than called inline: an assertion that repeats its
-- operand would launch twice.
create temporary table r6_launch on commit drop as
  select * from public.launch_expedition('rules-0130', 'S_TEST_R6', 'raid',
    array[tests.r6_card('r6-1'), tests.r6_card('r6-2'), tests.r6_card('r6-3')], 14, 24, 2, false, 0, 0, null, null, null);

select is((select rules from public.expedition_runs where id = (select run_id from r6_launch)), 6::smallint,
  'a fresh run is stamped with the edge rulebook');

-- === 2. a run already stamped keeps its rulebook ============================
-- A squad in the field resolves under the rules it left with; the new
-- default must not reach back into a row that says otherwise.
insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, rules)
values ('rules-0130', 'S_TEST_R6', 'scout',
        array[tests.r6_card('r6-4'), tests.r6_card('r6-5'), tests.r6_card('r6-6')],
        9, now() + interval '8 hours', 5);

select is((select rules from public.expedition_runs where discord_id = 'rules-0130' and tier = 'scout'), 5::smallint,
  'a run stamped 5 stays 5');

-- === 3. the app can ask =====================================================
select is(public.expedition_rules_version(), 6, 'the rulebook a launch will get is 6');

-- === 4-6. only the service role asks =======================================
select ok(not has_function_privilege('anon', 'public.expedition_rules_version()', 'execute'),
  'anon cannot read the rulebook version');
select ok(not has_function_privilege('authenticated', 'public.expedition_rules_version()', 'execute'),
  'authenticated cannot read the rulebook version');
select ok(has_function_privilege('service_role', 'public.expedition_rules_version()', 'execute'),
  'service_role can read the rulebook version');

-- === 7. the answer follows the default ======================================
-- The function exists so the app and the stamp cannot disagree; a later
-- migration that moves the default must move the answer without touching
-- this function. Rolled back with everything else.
alter table public.expedition_runs alter column rules set default 7;

select is(public.expedition_rules_version(), 7, 'the version is read off the column default, not restated');

select * from finish();
rollback;
