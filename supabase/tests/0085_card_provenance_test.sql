-- Provenance. The claim under test is that a copy's chain of custody is
-- written by the table itself rather than by whoever remembered to append to
-- it: every mint, every hand-off and every melt lands a row, a transfer
-- carries the cause its caller declared through fpl.provenance_ref, and a
-- write the database refuses leaves no trace of a move that never happened.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(16);

create temp table folks as
  select test_profile(5000) as alice, test_profile(5000) as bob;

create or replace function test_copy(p_owner text, p_slug text, p_pack bigint default null)
returns bigint language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card, pack_open_id)
  values (p_owner, 'S5', p_slug, 'Someone', 'Mid', '2026-08-24', 90, 'master', false, '{}'::jsonb, p_pack)
  returning id;
$$;

-- ==== Minting ============================================================

create temp table pack as
  with opened as (
    insert into public.card_pack_opens (discord_id, season, cost)
    values ((select alice from folks), 'S5', 400) returning id
  ) select id from opened;

create temp table pulled as select test_copy((select alice from folks), 'doug-na1', (select id from pack)) as id;

select is(
  (select count(*) from public.card_provenance where inventory_id = (select id from pulled)),
  1::bigint, 'a minted copy starts its chain with exactly one row');

select results_eq(
  $$select event, from_discord is null, to_discord, ref_table
      from public.card_provenance where inventory_id = (select id from pulled)$$,
  $$select 'minted', true, (select alice from folks), 'card_pack_opens'$$,
  'the mint names the puller and nobody before them, and points at the pack it fell out of');

select is(
  (select ref_id from public.card_provenance where inventory_id = (select id from pulled)),
  (select id from pack), 'the ref is read off the row (pack_open_id), not announced by the caller');

select is(
  (select at from public.card_provenance where inventory_id = (select id from pulled)),
  (select acquired_at from public.card_inventory where id = (select id from pulled)),
  'and it is dated when the copy was actually pulled');

-- A copy that came from something other than a pack still gets a chain; it
-- simply has nothing to point at.
create temp table granted as select test_copy((select alice from folks), 'spies-na1') as id;

select ok(
  (select ref_table is null and ref_id is null from public.card_provenance
    where inventory_id = (select id from granted)),
  'a copy minted outside a pack opens its chain unattributed rather than not at all');

-- ==== Transfers ==========================================================

update public.card_inventory set discord_id = (select bob from folks)
  where id = (select id from granted);

select results_eq(
  $$select event, from_discord, to_discord
      from public.card_provenance
     where inventory_id = (select id from granted) and event = 'transferred'$$,
  $$select 'transferred', (select alice from folks), (select bob from folks)$$,
  'moving discord_id records the hand-off in the direction it happened');

select ok(
  (select ref_table is null from public.card_provenance
    where inventory_id = (select id from granted) and event = 'transferred'),
  'with no ref when nothing declared one — an unattributed transfer is still a transfer');

-- Only discord_id is a transfer. An expedition stamping its mark rewrites
-- `card`, and a chain that logged that as a hand-off would bury the real
-- moves under noise.
update public.card_inventory set card = '{"expedition":{"mark":"trail"}}'::jsonb
  where id = (select id from granted);

select is(
  (select count(*) from public.card_provenance
    where inventory_id = (select id from granted) and event = 'transferred'),
  1::bigint, 'rewriting anything but the owner is not a transfer');

-- ==== The ref contract ===================================================
-- accept_card_trade declares its cause through fpl.provenance_ref
-- immediately before its two updates; the trigger stamps what it finds.

create temp table mine as select test_copy((select alice from folks), 'kite-na1') as id;
create temp table yours as select test_copy((select bob from folks), 'canny-na1') as id;

create temp table trade as
  with offered as (
    insert into public.card_trades
      (season, from_discord, to_discord, offered_inventory_ids, requested_inventory_ids)
    values ('S5', (select alice from folks), (select bob from folks),
            array[(select id from mine)], array[(select id from yours)])
    returning id
  ) select id from offered;

select lives_ok(
  $$select public.accept_card_trade((select id from trade), (select bob from folks))$$,
  'the trade goes through');

select results_eq(
  $$select from_discord, to_discord, ref_table, ref_id
      from public.card_provenance
     where inventory_id = (select id from mine) and event = 'transferred'$$,
  $$select (select alice from folks), (select bob from folks), 'card_trades', (select id from trade)$$,
  'the offered copy''s hand-off is stamped with the trade that caused it');

select results_eq(
  $$select from_discord, to_discord, ref_table, ref_id
      from public.card_provenance
     where inventory_id = (select id from yours) and event = 'transferred'$$,
  $$select (select bob from folks), (select alice from folks), 'card_trades', (select id from trade)$$,
  'and the requested copy''s runs the other way, under the same trade');

-- ==== Dusting ============================================================

select lives_ok(
  format($$select public.dust_card((select alice from folks), %s, 500)$$, (select id from pulled)),
  'the first copy is dusted');

select results_eq(
  $$select event, from_discord, to_discord is null
      from public.card_provenance
     where inventory_id = (select id from pulled) and event = 'dusted'$$,
  $$select 'dusted', (select alice from folks), true$$,
  'destroying a copy closes its chain with who destroyed it');

-- The point of having no foreign key: the history is still there once the
-- row it describes is gone.
select is(
  (select count(*) from public.card_provenance where inventory_id = (select id from pulled)),
  2::bigint, 'and the whole chain outlives the copy it belongs to');

-- ==== The expedition guard still gets there first ========================
-- card_inventory_expedition_guard is a BEFORE trigger that raises. The
-- provenance triggers are AFTER, so a refused move must leave nothing
-- behind — a chain that logged attempts would be a chain that lies.

create temp table squad as
  select test_copy((select bob from folks), 'deployed-a') as a,
         test_copy((select bob from folks), 'deployed-b') as b,
         test_copy((select bob from folks), 'deployed-c') as c;

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
select (select bob from folks), 'S5', 'scout', array[a, b, c], 10, now() + interval '1 hour'
  from squad;

select throws_ok(
  $$update public.card_inventory set discord_id = (select alice from folks)
     where id = (select a from squad)$$,
  'P0001', 'card is on expedition',
  'a deployed copy cannot be handed off');

select is(
  (select count(*) from public.card_provenance where inventory_id = (select a from squad)),
  1::bigint, 'and the refusal wrote no provenance — the chain still shows only the mint');

select * from finish();
rollback;
