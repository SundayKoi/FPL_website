-- Expedition routes — forks, harm, mutations, insurance, rescue, death.
--
-- The app rolls every outcome (src/lib/expeditions/routes.ts); Postgres
-- owns the law. This suite exercises the law: the fork window, the fees
-- and fragments, the consent rules on the launch, what a claim may stamp
-- and where, the hold that keeps a lost card in the collection, the
-- ransom, the grave, and the curse that keeps a card off the market.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(62);

grant usage on schema tests to anon, authenticated;

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0090'::uuid, 'route-0090', 'Route Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('route-0090', '00000000-0000-0000-0000-0000000e0090'::uuid, 'Route Owner', 1000);

insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0091'::uuid, 'other-0090', 'Other Collector');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('other-0090', '00000000-0000-0000-0000-0000000e0091'::uuid, 'Other Collector', 100);

-- Twelve ordinary cards, one Eclipse, one wounded, one haunted.
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'route-0090', 'S_TEST_RT', 'rt-' || n, 'Route Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'rt-' || n, 'name', 'Route Player ' || n)
from generate_series(1, 12) n;

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, card)
values ('route-0090', 'S_TEST_RT', 'rt-eclipse', 'Eclipse Player', 'Mid',
        date '2026-08-24', 90, 'challenger', true, 'eclipse', '{"slug":"rt-eclipse"}'::jsonb);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('route-0090', 'S_TEST_RT', 'rt-hurt', 'Hurt Player', 'Mid',
        date '2026-08-24', 80, 'platinum', false,
        jsonb_build_object('slug', 'rt-hurt', 'wounded', jsonb_build_object('until', now() + interval '1 day', 'run', 0)));

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('route-0090', 'S_TEST_RT', 'rt-haunted', 'Haunted Player', 'Mid',
        date '2026-08-24', 80, 'platinum', false,
        jsonb_build_object('slug', 'rt-haunted', 'mutation', jsonb_build_object('key', 'haunted', 'date', '2026-08-01', 'run', 0)));

create or replace function tests.rt_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_RT' and slug = p_slug
$$;

create or replace function tests.rt_run(p_seq int) returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'route-0090' and tier <> 'lost'
  order by id offset p_seq - 1 limit 1
$$;

create or replace function tests.rt_hold(p_slug text) returns bigint
language sql stable as $$
  select id from public.expedition_runs
  where discord_id = 'route-0090' and tier = 'lost' and claimed_at is null
    and squad[1] = tests.rt_card(p_slug)
$$;

-- === 1-8. schema contract ====================================================

select has_column('public', 'expedition_runs', 'forks', 'runs carry a fork count');
select has_column('public', 'expedition_runs', 'choices', 'runs carry their choices');
select has_column('public', 'expedition_runs', 'insured', 'runs carry insurance');
select has_column('public', 'card_inventory', 'mutation', 'a copy carries its mutation as a column');
select has_table('public', 'expedition_supplies', 'supplies exist');
select has_table('public', 'expedition_graveyard', 'the graveyard exists');
select has_function('public', 'resolve_expedition', array['text', 'bigint', 'jsonb'], 'resolve_expedition exists');
select has_function('public', 'decide_expedition_fork', array['text', 'bigint', 'integer', 'text'], 'decide_expedition_fork exists');

-- The generated column follows the json.
select is((select mutation from public.card_inventory where id = tests.rt_card('rt-haunted')), 'haunted',
  'the mutation column is generated off the card json');

-- === 10-17. the launch's new refusals ========================================

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'raid',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 14, 24, 9, false, 0, 0, null, null) $$,
  'P0001', 'bad forks', 'an absurd fork count cannot launch');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'scout',
    array[tests.rt_card('rt-hurt'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 9, 8, 1, false, 0, 0, null, null) $$,
  'P0001', 'card is wounded', 'a wounded card is benched');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'legend',
    array[tests.rt_card('rt-eclipse'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 30, 48, 3, false, 0, 0, null, null) $$,
  'P0001', 'card is one of one', 'an Eclipse never boards a route that can lose it');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'rescue',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 9, 12, 1, false, 0, 0, null, null) $$,
  'P0001', 'no such lost card', 'a rescue needs a lost card to go after');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'exorcism',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 9, 8, 0, false, 400, 0, tests.rt_card('rt-1'), null) $$,
  'P0001', 'card is not afflicted', 'an exorcism needs something to cleanse');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'legendary',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 30, 72, 4, false, 0, 3, null, null) $$,
  'P0001', 'not enough fragments', 'the Legendary route needs three fragments');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'raid',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 14, 24, 2, true, 150, 0, null, date '2026-08-31') $$,
  'P0001', 'policy is a patron perk', 'the free policy is a patron perk');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'raid',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 14, 24, 2, true, 5000, 0, null, null) $$,
  'P0001', 'insufficient balance', 'a fee the wallet cannot cover refuses');

-- === 18-21. an insured raid launches, and the fee is ledgered ================

create temporary table rt_launch on commit drop as
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'raid',
    array[tests.rt_card('rt-1'), tests.rt_card('rt-2'), tests.rt_card('rt-3')], 14, 24, 2, true, 150, 0, null, null);

select is((select balance from public.betting_profiles where discord_id = 'route-0090'), 850::bigint,
  'the insurance fee is debited');
select is((select count(*) from public.betting_ledger where discord_id = 'route-0090' and reason = 'expedition_fee')::int, 1,
  'the fee writes its ledger row');
select is((select forks from public.expedition_runs where id = tests.rt_run(1)), 2, 'the run records its forks');
select is((select insured from public.expedition_runs where id = tests.rt_run(1)), true, 'the run records its insurance');

-- === 22-27. the fork window ==================================================

select throws_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 0, 'push') $$,
  'P0001', 'fork not open', 'a fork cannot be answered before the squad reaches it');

select throws_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 0, 'sprint') $$,
  'P0001', 'unknown choice', 'an invented choice is refused');

-- Time-travel: nine hours in, the first fork (at 8h) is open, the second (16h) is not.
update public.expedition_runs
  set started_at = now() - interval '9 hours', resolves_at = now() + interval '15 hours'
  where id = tests.rt_run(1);

select throws_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 1, 'push') $$,
  'P0001', 'fork not open', 'the second fork is still ahead');

select lives_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 0, 'push') $$,
  'the open fork takes an answer');

select throws_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 0, 'camp') $$,
  'P0001', 'fork already decided', 'a fork is answered once');

select is(
  (select choices -> 0 ->> 'choice' from public.expedition_runs where id = tests.rt_run(1)), 'push',
  'the answer is recorded');

-- Seventeen hours in: the first fork has closed.
update public.expedition_runs
  set started_at = now() - interval '17 hours', resolves_at = now() + interval '7 hours',
      choices = '[]'::jsonb
  where id = tests.rt_run(1);

select throws_ok(
  $$ select * from public.decide_expedition_fork('route-0090', tests.rt_run(1), 0, 'camp') $$,
  'P0001', 'fork closed', 'a fork whose window has passed takes no answer');

-- === 29-36. the claim: fates the route allows, and the stamps ================

update public.expedition_runs set resolves_at = now() - interval '1 minute' where id = tests.rt_run(1);

select throws_ok($$
  select * from public.resolve_expedition('route-0090', tests.rt_run(1), jsonb_build_object(
    'grade', 'solid', 'dollars', 300, 'comp', false,
    'fates', jsonb_build_array(jsonb_build_object('id', tests.rt_card('rt-1'), 'fate', 'dead')))) $$,
  'P0001', 'fate beyond route', 'nothing dies on a Deep Raid');

select throws_ok($$
  select * from public.resolve_expedition('route-0090', tests.rt_run(1), jsonb_build_object(
    'grade', 'solid', 'dollars', 300, 'comp', false,
    'fates', jsonb_build_array(jsonb_build_object('id', tests.rt_card('rt-9'), 'fate', 'wounded')))) $$,
  'P0001', 'fate not in squad', 'a fate must name a squad member');

select throws_ok($$
  select * from public.resolve_expedition('route-0090', tests.rt_run(1), jsonb_build_object(
    'grade', 'solid', 'dollars', 99999, 'comp', false, 'fates', '[]'::jsonb)) $$,
  'P0001', 'payout out of range', 'the ceiling holds');

create temporary table rt_claim on commit drop as
  select * from public.resolve_expedition('route-0090', tests.rt_run(1), jsonb_build_object(
    'grade', 'solid', 'dollars', 300, 'comp', false, 'fragments', 1,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.rt_card('rt-1'), 'fate', 'wounded', 'until', now() + interval '72 hours', 'mutation', 'hardened'),
      jsonb_build_object('id', tests.rt_card('rt-2'), 'fate', 'home', 'mutation', 'irradiated'),
      jsonb_build_object('id', tests.rt_card('rt-3'), 'fate', 'home'))));

select is((select balance from rt_claim), 1150::bigint, 'the claim pays');
select is((select fragments from rt_claim), 1, 'a fragment is banked');
select is((select mutation from public.card_inventory where id = tests.rt_card('rt-1')), 'hardened',
  'the mutation stamps the copy');
select ok(
  (select (card -> 'wounded' ->> 'until')::timestamptz from public.card_inventory where id = tests.rt_card('rt-1')) > now(),
  'the wound benches the copy');
select is((select fragments from public.expedition_supplies where discord_id = 'route-0090'), 1,
  'supplies hold the fragment');

-- === 37-38. one mutation per copy ===========================================
-- A second stamp onto rt-2 (already irradiated) is dropped by the RPC even
-- when the app sends it. Inserted rather than launched: the day's slot is spent.

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks)
values ('route-0090', 'S_TEST_RT', 'legend',
        array[tests.rt_card('rt-2'), tests.rt_card('rt-4'), tests.rt_card('rt-5')], 20, now() - interval '1 minute', 3);

create temporary table rt_second on commit drop as
  select * from public.resolve_expedition('route-0090', tests.rt_run(2), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 2000, 'comp', false, 'mark', 'legend', 'bearer', tests.rt_card('rt-4'),
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.rt_card('rt-2'), 'fate', 'home', 'mutation', 'haunted'),
      jsonb_build_object('id', tests.rt_card('rt-4'), 'fate', 'lost'),
      jsonb_build_object('id', tests.rt_card('rt-5'), 'fate', 'home'))));

select is((select mutation from public.card_inventory where id = tests.rt_card('rt-2')), 'irradiated',
  'a stamped copy keeps its first mutation');
select is((select card -> 'expedition' ->> 'mark' from public.card_inventory where id = tests.rt_card('rt-4')), 'legend',
  'the mark still lands');

-- === 39-43. a lost card is held, not gone =====================================

select isnt(tests.rt_hold('rt-4'), null::bigint, 'a lost card gets a hold');
select is((select discord_id from public.card_inventory where id = tests.rt_card('rt-4')), 'route-0090',
  'the lost card is still in the collection');

select throws_ok(
  $$ select public.dust_card('route-0090', tests.rt_card('rt-4'), 10) $$,
  'P0001', 'card is on expedition', 'a lost card cannot be dusted');

select throws_ok($$
  select * from public.launch_expedition('route-0090', 'S_TEST_RT', 'scout',
    array[tests.rt_card('rt-4'), tests.rt_card('rt-6'), tests.rt_card('rt-7')], 9, 8, 1, false, 0, 0, null, null) $$,
  'P0001', 'card already deployed', 'a lost card cannot be sent out');

-- Holds do not spend the day's launches or a tier slot.
select is((select count(*) from public.expedition_runs where discord_id = 'route-0090' and tier = 'lost')::int, 1,
  'exactly one hold');

-- === 44-47. the ransom ======================================================

select throws_ok(
  $$ select * from public.ransom_lost_card('route-0090', tests.rt_hold('rt-4'), 999999) $$,
  'P0001', 'bad ransom', 'a ransom is range checked');

select throws_ok(
  $$ select * from public.ransom_lost_card('other-0090', tests.rt_hold('rt-4'), 340) $$,
  'P0001', 'no such lost card', 'another collector cannot ransom your card');

create temporary table rt_ransom on commit drop as
  select * from public.ransom_lost_card('route-0090', tests.rt_hold('rt-4'), 340);

select is((select balance from rt_ransom), (1150 + 2000 - 340)::bigint, 'the ransom is paid');
select is(tests.rt_hold('rt-4'), null::bigint, 'the hold is released');
select ok(
  (select (card -> 'wounded' ->> 'until')::timestamptz from public.card_inventory where id = tests.rt_card('rt-4')) > now(),
  'a ransomed card comes home wounded');

-- === 49-53. the grave =======================================================

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks, target)
values ('route-0090', 'S_TEST_RT', 'lost', array[tests.rt_card('rt-6')], 0, now() - interval '1 minute', 0, tests.rt_run(2));

select is(public.expire_lost_cards(), 1, 'the sweep buries the hold nobody came for');
select is((select count(*) from public.card_inventory where id = tests.rt_card('rt-6'))::int, 0,
  'the unrescued card is gone from the collection');
select is((select cause from public.expedition_graveyard where slug = 'rt-6' and discord_id = 'route-0090'), 'unrescued',
  'the graveyard says why');
select is((select event from public.card_provenance where inventory_id = (select inventory_id from public.expedition_graveyard where slug = 'rt-6')
           order by id desc limit 1), 'died', 'provenance records a death, not a dust');
select is(public.expire_lost_cards(), 0, 'nothing left to bury');

-- === 54-56. death on the Legendary route =====================================

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks)
values ('route-0090', 'S_TEST_RT', 'legendary',
        array[tests.rt_card('rt-7'), tests.rt_card('rt-8'), tests.rt_card('rt-9')], 30, now() - interval '1 minute', 4);

create temporary table rt_legendary on commit drop as
  select * from public.resolve_expedition('route-0090', tests.rt_run(3), jsonb_build_object(
    'grade', 'jackpot', 'dollars', 5000, 'comp', true,
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.rt_card('rt-7'), 'fate', 'dead'),
      jsonb_build_object('id', tests.rt_card('rt-8'), 'fate', 'home', 'mutation', 'voidtouched'),
      jsonb_build_object('id', tests.rt_card('rt-9'), 'fate', 'home'))));

select is((select count(*) from public.card_inventory where slug = 'rt-7' and season = 'S_TEST_RT')::int, 0,
  'a dead card leaves the collection');
select is((select cause from public.expedition_graveyard where slug = 'rt-7'), 'route', 'and is buried');
select is((select mutation from public.card_inventory where id = tests.rt_card('rt-8')), 'voidtouched',
  'a survivor comes home Voidtouched');

-- === 57-58. the curse guard ==================================================

update public.card_inventory
  set card = card || jsonb_build_object('mutation', jsonb_build_object('key', 'cursed', 'date', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'run', 0))
  where id = tests.rt_card('rt-10');

select throws_ok(
  $$ update public.card_inventory set discord_id = 'other-0090' where id = tests.rt_card('rt-10') $$,
  'P0001', 'card is cursed', 'a fresh curse keeps a card off the market');

update public.card_inventory
  set card = card || jsonb_build_object('mutation', jsonb_build_object('key', 'cursed', 'date', '2026-01-01', 'run', 0))
  where id = tests.rt_card('rt-10');

select lives_ok(
  $$ update public.card_inventory set discord_id = 'other-0090' where id = tests.rt_card('rt-10') $$,
  'an old curse trades like anything else');

-- === 59-60. the exorcism cleanses its target ================================

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at, forks, target, fee)
values ('route-0090', 'S_TEST_RT', 'exorcism',
        array[tests.rt_card('rt-haunted'), tests.rt_card('rt-11'), tests.rt_card('rt-12')], 9, now() - interval '1 minute', 0,
        tests.rt_card('rt-haunted'), 400);

create temporary table rt_exorcism on commit drop as
  select * from public.resolve_expedition('route-0090', tests.rt_run(4), jsonb_build_object(
    'grade', 'solid', 'dollars', 0, 'comp', false, 'cleansed', tests.rt_card('rt-haunted'),
    'fates', jsonb_build_array(
      jsonb_build_object('id', tests.rt_card('rt-haunted'), 'fate', 'home'),
      jsonb_build_object('id', tests.rt_card('rt-11'), 'fate', 'home'),
      jsonb_build_object('id', tests.rt_card('rt-12'), 'fate', 'home'))));

select is((select mutation from public.card_inventory where id = tests.rt_card('rt-haunted')), null::text,
  'the exorcism removes the mutation');
select is((select count(*) from public.betting_ledger where discord_id = 'route-0090' and reason = 'expedition'
           and ref_id = tests.rt_run(4))::int, 0, 'a zero payout writes no ledger row');

-- === 61-62. grants ==========================================================

select ok(not has_function_privilege('authenticated', 'public.resolve_expedition(text,bigint,jsonb)', 'execute'),
  'authenticated cannot resolve expeditions');
select ok(has_function_privilege('service_role', 'public.ransom_lost_card(text,bigint,bigint)', 'execute'),
  'service_role can ransom');

select * from finish();
rollback;
