-- Card Expeditions — the launch/claim RPCs and the deploy lock.
--
-- The app computes shine, gates and outcome rolls (src/lib/expeditions/
-- config.ts); Postgres owns the atomicity and the law. So this suite
-- exercises exactly the law: ownership, the no-double-deploy check, the
-- Eastern-day limit (two for patrons), the payout ledger, the mark stamp
-- and its replace-only-upward rule, and the trigger that keeps a deployed
-- copy from being melted or traded away.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(45);

grant usage on schema tests to anon, authenticated;

-- === fixture =================================================================
-- The owner: a profile (the RLS policy joins profiles.discord_id against
-- auth.uid()) and the wallet the payouts land in. patron_until stays null
-- so the first daily-limit assertion sees the free tier.
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e0069'::uuid, 'exped-0069', 'Expedition Owner');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('exped-0069', '00000000-0000-0000-0000-0000000e0069'::uuid, 'Expedition Owner', 500);

-- A second collector — proves ownership is checked and that RLS is a
-- filter rather than a formality.
insert into public.profiles (id, discord_id, display_name)
values ('00000000-0000-0000-0000-0000000e006a'::uuid, 'other-0069', 'Other Collector');

insert into public.betting_profiles (discord_id, profile_id, username, balance)
values ('other-0069', '00000000-0000-0000-0000-0000000e006a'::uuid, 'Other Collector', 100);

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'exped-0069', 'S_TEST_EXP', 'exp-' || n, 'Expedition Player ' || n, 'Mid',
       date '2026-08-24', 80, 'platinum', false,
       jsonb_build_object('slug', 'exp-' || n, 'name', 'Expedition Player ' || n)
from generate_series(1, 7) n;

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('other-0069', 'S_TEST_EXP', 'exp-alien', 'Alien Player', 'Mid',
        date '2026-08-24', 80, 'platinum', false, '{"slug":"exp-alien"}'::jsonb);

-- Identity-column ids are not knowable up front, so the assertions below
-- name copies and runs by these lookups rather than by literal id.
create or replace function tests.exp_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_EXP' and slug = p_slug
$$;

create or replace function tests.exp_run(p_seq int) returns bigint
language sql stable as $$
  select id from public.expedition_runs where discord_id = 'exped-0069'
  order by id offset p_seq - 1 limit 1
$$;

-- === 1-4. schema contract ====================================================

select has_table('public', 'expedition_runs', 'expedition_runs exists');
select has_function('public', 'launch_expedition',
  array['text', 'text', 'text', 'bigint[]', 'integer', 'integer'], 'launch_expedition exists');
select has_function('public', 'claim_expedition',
  array['text', 'bigint', 'text', 'bigint', 'boolean', 'text', 'bigint'], 'claim_expedition exists');
select ok(
  coalesce((
    select c.relrowsecurity from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'expedition_runs'
  ), false),
  'expedition_runs has row-level security enabled');

-- === 5-9. launch refuses malformed and unowned squads =========================

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2')], 9, 8) $$,
  'P0001', 'squad must be three distinct cards', 'a two-card squad cannot launch');

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-1'), tests.exp_card('exp-2')], 9, 8) $$,
  'P0001', 'squad must be three distinct cards', 'the same copy cannot fill two slots');

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'picnic',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-3')], 9, 8) $$,
  'P0001', 'unknown tier', 'an invented tier cannot launch');

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-3')], 9, 500) $$,
  'P0001', 'bad duration', 'an absurd duration cannot launch');

-- Ownership is the RPC's own check, not the caller's promise.
select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-alien')], 9, 8) $$,
  'P0001', 'card not owned', 'a squad may not include somebody else''s copy');

-- === 10-13. the happy launch =================================================
-- The launch is captured into a temp table rather than called inline in the
-- assertion: `between` duplicates its left operand in the parser, so an
-- inline call would run the RPC twice and the second call would trip the
-- daily limit.

create temporary table exp_launch on commit drop as
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-3')], 9, 8);

select ok(
  (select resolves_at from exp_launch)
    between now() + interval '7 hours 59 minutes' and now() + interval '8 hours 1 minute',
  'a scouting run resolves eight hours out');

select is((select run_id from exp_launch), tests.exp_run(1), 'launch returns the run it created');

select is((select count(*) from public.expedition_runs where discord_id = 'exped-0069')::int, 1,
  'one run recorded');

select is(
  (select squad from public.expedition_runs where id = tests.exp_run(1)),
  array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-3')],
  'the squad is stored as launched');

-- === 14-17. the Eastern-day limit and the patron slot ========================

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-4'), tests.exp_card('exp-5'), tests.exp_card('exp-6')], 9, 8) $$,
  'P0001', 'daily expedition limit', 'a free collector gets one run a day');

update public.betting_profiles set patron_until = now() + interval '30 days'
  where discord_id = 'exped-0069';

-- With the patron slot open, the deploy check is now the thing that
-- refuses a squad holding a copy that is already out.
select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-4'), tests.exp_card('exp-5')], 9, 8) $$,
  'P0001', 'card already deployed', 'a copy already out cannot be sent again');

select lives_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'raid',
    array[tests.exp_card('exp-4'), tests.exp_card('exp-5'), tests.exp_card('exp-6')], 14, 24) $$,
  'a patron may launch a second run the same day');

select throws_ok($$
  select * from public.launch_expedition('exped-0069', 'S_TEST_EXP', 'scout',
    array[tests.exp_card('exp-1'), tests.exp_card('exp-2'), tests.exp_card('exp-3')], 9, 8) $$,
  'P0001', 'daily expedition limit', 'the patron slot is a second run, not unlimited runs');

-- === 18-20. the deploy lock ==================================================
-- The trigger, not the RPC, is the guarantee: a deployed copy cannot leave
-- the collection by melt or by trade, however the delete is issued.

select throws_ok(
  $$ select public.dust_card('exped-0069', tests.exp_card('exp-1'), 10) $$,
  'P0001', 'card is on expedition', 'a deployed copy cannot be dusted');

select throws_ok(
  $$ delete from public.card_inventory where id = tests.exp_card('exp-1') $$,
  'P0001', 'card is on expedition', 'a deployed copy cannot be deleted directly');

select throws_ok(
  $$ update public.card_inventory set discord_id = 'other-0069' where id = tests.exp_card('exp-1') $$,
  'P0001', 'card is on expedition', 'a deployed copy cannot be traded away');

-- === 21-25. claim guards =====================================================

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', tests.exp_run(1), 'solid', 120, true, 'trail', tests.exp_card('exp-1')) $$,
  'P0001', 'expedition still out', 'a run cannot be claimed before it resolves');

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', 987654321, 'solid', 120, false, null, null) $$,
  'P0001', 'unknown run', 'a run that is not yours is not a run');

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', tests.exp_run(1), 'triumph', 120, false, null, null) $$,
  'P0001', 'unknown grade', 'an invented grade cannot be claimed');

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', tests.exp_run(1), 'solid', 999999, false, null, null) $$,
  'P0001', 'payout out of range', 'a forged payout cannot mint a balance');

-- Time-travel the run rather than waiting eight hours.
update public.expedition_runs set resolves_at = now() - interval '1 minute'
  where id = tests.exp_run(1);

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', tests.exp_run(1), 'solid', 120, false, 'trail', tests.exp_card('exp-7')) $$,
  'P0001', 'bearer not in squad', 'only a squad member can wear the mark');

-- === 26-31. the claim pays, stamps and locks =================================

select is(
  (select r.balance from public.claim_expedition('exped-0069', tests.exp_run(1), 'solid', 120, true, 'trail', tests.exp_card('exp-1')) r),
  620::bigint, 'the claim credits the payout');

select is(
  (select count(*) from public.betting_ledger where discord_id = 'exped-0069' and reason = 'expedition')::int,
  1, 'the payout writes its ledger row');

select is(
  (select card -> 'expedition' ->> 'mark' from public.card_inventory where id = tests.exp_card('exp-1')),
  'trail', 'the bearer is stamped with the mark');

select is(
  (select card -> 'expedition' ->> 'tier' from public.card_inventory where id = tests.exp_card('exp-1')),
  'scout', 'the stamp records the tier that earned it');

select is(
  (select remaining from public.card_pack_comps where discord_id = 'exped-0069' and kind = 'standard'),
  1, 'a standard pack comp comes home too');

select throws_ok(
  $$ select * from public.claim_expedition('exped-0069', tests.exp_run(1), 'jackpot', 400, true, 'legend', tests.exp_card('exp-1')) $$,
  'P0001', 'already claimed', 'claimed_at is the reroll lock');

-- === 32-34. marks replace only upward ========================================
-- A copy already wearing a better mark keeps it; the dollars pay anyway,
-- because the mark is cosmetic and the run still happened.

update public.card_inventory
  set card = card || '{"expedition": {"mark": "legend", "tier": "legend", "date": "2026-08-01"}}'::jsonb
  where id = tests.exp_card('exp-6');

update public.expedition_runs set resolves_at = now() - interval '1 minute'
  where id = tests.exp_run(2);

select is(
  (select r.balance from public.claim_expedition('exped-0069', tests.exp_run(2), 'poor', 80, true, 'sigil', tests.exp_card('exp-6')) r),
  700::bigint, 'a lesser mark still pays its dollars');

select is(
  (select card -> 'expedition' ->> 'mark' from public.card_inventory where id = tests.exp_card('exp-6')),
  'legend', 'a lesser mark does not overwrite a better one');

select is(
  (select remaining from public.card_pack_comps where discord_id = 'exped-0069' and kind = 'standard'),
  2, 'a second comp stacks on the existing row');

-- === 35. the lock lifts with the claim =======================================

select lives_ok(
  $$ select public.dust_card('exped-0069', tests.exp_card('exp-1'), 10) $$,
  'a claimed copy is free to melt again');

-- === 36-41. execute grants ===================================================
-- Both RPCs move betting dollars on an unverified discord id, so the app
-- layer is the authorization and PostgREST must never reach them.

select ok(not has_function_privilege('anon',
  'public.launch_expedition(text,text,text,bigint[],int,int)', 'execute'),
  'anon cannot launch expeditions');
select ok(not has_function_privilege('authenticated',
  'public.launch_expedition(text,text,text,bigint[],int,int)', 'execute'),
  'authenticated cannot launch expeditions');
select ok(has_function_privilege('service_role',
  'public.launch_expedition(text,text,text,bigint[],int,int)', 'execute'),
  'service_role can launch expeditions');

select ok(not has_function_privilege('anon',
  'public.claim_expedition(text,bigint,text,bigint,boolean,text,bigint)', 'execute'),
  'anon cannot claim expeditions');
select ok(not has_function_privilege('authenticated',
  'public.claim_expedition(text,bigint,text,bigint,boolean,text,bigint)', 'execute'),
  'authenticated cannot claim expeditions');
select ok(has_function_privilege('service_role',
  'public.claim_expedition(text,bigint,text,bigint,boolean,text,bigint)', 'execute'),
  'service_role can claim expeditions');

-- === 42-45. row-level security ===============================================
-- A run belonging to somebody else is the non-vacuous half: a `using (true)`
-- policy would pass a bare count, so the other collector's run must be
-- invisible while the owner's two stay readable.

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
values ('other-0069', 'S_TEST_EXP', 'scout',
        array[tests.exp_card('exp-alien'), -1::bigint, -2::bigint], 3, now() + interval '8 hours');

select tests.acting_as('00000000-0000-0000-0000-0000000e0069'::uuid);
set local role authenticated;
select is((select count(*) from public.expedition_runs)::int, 2,
  'the owner reads their own two runs');
select is_empty($$ select 1 from public.expedition_runs where discord_id = 'other-0069' $$,
  'the owner cannot read another collector''s run');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.expedition_runs $$,
  '42501', null, 'anon cannot read runs at all');
select throws_ok($$
  insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
  values ('exped-0069', 'S_TEST_EXP', 'scout', array[1::bigint, 2::bigint, 3::bigint], 3, now()) $$,
  '42501', null, 'anon cannot write runs');
reset role;

select * from finish();
rollback;
