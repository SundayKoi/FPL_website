-- Roster set claims — the payout RPC and the two uniqueness rules it rests
-- on.
--
-- The app decides who a team's five are (src/lib/cards/sets.ts, tested
-- there). This suite exercises what only Postgres can promise: that a set
-- pays its collector once, that a copy is spent once ever — so the same
-- five cards cannot be traded round a group and paid for each of them —
-- that the copies are the caller's and from the week claimed, and that
-- nothing is credited when any of that fails.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(17);

grant usage on schema tests to anon, authenticated;

-- === fixture =================================================================
insert into public.profiles (id, discord_id, display_name) values
  ('00000000-0000-0000-0000-0000000e0070'::uuid, 'set-0070', 'Set Collector'),
  ('00000000-0000-0000-0000-0000000e0071'::uuid, 'set-0071', 'Second Collector');

insert into public.betting_profiles (discord_id, profile_id, username, balance) values
  ('set-0070', '00000000-0000-0000-0000-0000000e0070'::uuid, 'Set Collector', 500),
  ('set-0071', '00000000-0000-0000-0000-0000000e0071'::uuid, 'Second Collector', 500);

-- Five copies of the claimed week, plus one from the week before.
insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
select 'set-0070', 'S_TEST_SET', 'set-' || n, 'Set Player ' || n, 'Mid',
       date '2026-08-24', 80, 'gold', false, jsonb_build_object('slug', 'set-' || n)
from generate_series(1, 5) n;

insert into public.card_inventory
  (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
values ('set-0070', 'S_TEST_SET', 'set-old', 'Old Week Player', 'Mid',
        date '2026-08-17', 80, 'gold', false, '{"slug":"set-old"}'::jsonb);

create or replace function tests.set_card(p_slug text) returns bigint
language sql stable as $$
  select id from public.card_inventory where season = 'S_TEST_SET' and slug = p_slug
$$;

create or replace function tests.set_five() returns bigint[]
language sql stable as $$
  select array_agg(id order by id) from public.card_inventory
  where season = 'S_TEST_SET' and edition_week = date '2026-08-24'
$$;

-- === 1-3. schema contract ====================================================
select has_table('public', 'card_set_claims', 'card_set_claims exists');
select has_table('public', 'card_set_claim_copies', 'card_set_claim_copies exists');
select has_function('public', 'claim_team_set',
  array['text', 'text', 'date', 'text', 'bigint[]', 'bigint'], 'claim_team_set exists');

-- === 4-7. the arguments it refuses ===========================================
select throws_ok($$
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    array[tests.set_card('set-1'), tests.set_card('set-2')], 100) $$,
  'P0001', 'a set is five distinct cards', 'a set is five cards, not two');

select throws_ok($$
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    array[tests.set_card('set-1'), tests.set_card('set-1'), tests.set_card('set-2'),
          tests.set_card('set-3'), tests.set_card('set-4')], 100) $$,
  'P0001', 'a set is five distinct cards', 'the same copy cannot fill two slots');

select throws_ok($$
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    tests.set_five(), 999999) $$,
  'P0001', 'bad amount', 'the payout is ranged whatever the caller passes');

-- A copy from the week before cannot stand in for one of that week's five.
select throws_ok($$
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    array[tests.set_card('set-old'), tests.set_card('set-2'), tests.set_card('set-3'),
          tests.set_card('set-4'), tests.set_card('set-5')], 100) $$,
  'P0001', 'cards not owned for that week', 'last week''s copy does not fill this week''s slot');

-- === 8-10. nothing was credited by any of that ===============================
select is((select balance from public.betting_profiles where discord_id = 'set-0070'),
  500::bigint, 'a refused claim credits nothing');
select is((select count(*)::int from public.card_set_claims), 0, 'and records no claim');
select is((select count(*)::int from public.card_set_claim_copies), 0, 'and spends no copy');

-- === 11-14. the claim pays, once =============================================
create temporary table set_claim on commit drop as
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    tests.set_five(), 100);

select is((select balance from set_claim), 600::bigint, 'the bonus lands in the wallet');
select is((select count(*)::int from public.card_set_claim_copies), 5, 'all five copies are spent');
select is(
  (select delta from public.betting_ledger
    where discord_id = 'set-0070' and reason = 'team_set' order by id desc limit 1),
  100::bigint, 'and the ledger records it');

select throws_ok($$
  select * from public.claim_team_set('set-0070', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    tests.set_five(), 100) $$,
  '23505', null, 'the same collector cannot claim the same set twice');

-- === 15-17. a spent copy is spent for everyone ===============================
-- The rule a claims table alone cannot express: uniqueness there is per
-- PERSON, and the thing being reused is the cards. Trade the five on and
-- the second collector gets nothing.

update public.card_inventory set discord_id = 'set-0071'
  where season = 'S_TEST_SET' and edition_week = date '2026-08-24';

select throws_ok($$
  select * from public.claim_team_set('set-0071', 'S_TEST_SET', date '2026-08-24', 'Wolves',
    tests.set_five(), 100) $$,
  '23505', null, 'five cards traded on do not pay a second collector');

select is((select balance from public.betting_profiles where discord_id = 'set-0071'),
  500::bigint, 'and that collector is credited nothing');
select is((select count(*)::int from public.betting_ledger where reason = 'team_set'), 1,
  'one completed set, one ledger entry, however many times it changes hands');

select * from finish();
rollback;
