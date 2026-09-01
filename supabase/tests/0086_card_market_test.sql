-- The market's money rules, which is to say: the ones the application is not
-- allowed to be the only thing enforcing.
--
-- A sale is a card going one way and dollars going the other. Every case
-- below is a way that could half-happen — the buyer is broke, the seller
-- already traded the card away, two buyers click at once, the copy is out on
-- an expedition — and the assertion is always the same shape: it raises, and
-- NOTHING moved.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc

select plan(40);

-- One copy of one player, owned by whoever asks for it.
create or replace function mk_copy(p_owner text, p_slug text default 'doug-na1', p_season text default 'S5')
returns bigint language sql as $$
  insert into public.card_inventory
    (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, card)
  values (p_owner, p_season, p_slug, 'Someone', 'Mid', '2026-08-24', 90, 'master', false, '{}'::jsonb)
  returning id;
$$;

create or replace function mk_listing(p_seller text, p_copy bigint, p_ask bigint,
                                      p_expires interval default interval '14 days')
returns bigint language sql as $$
  insert into public.card_listings (season, inventory_id, seller_discord, ask, expires_at)
  values ('S5', p_copy, p_seller, p_ask, now() + p_expires)
  returning id;
$$;

create temp table who as
  select test_profile(0)    as seller,
         test_profile(5000) as buyer,
         test_profile(10)   as pauper,
         test_profile(3000) as poster,
         test_profile(0)    as stranger;

-- ==== buy: the happy path ==================================================

create temp table sale as
  select mk_copy((select seller from who)) as copy;
create temp table sale_l as
  select mk_listing((select seller from who), (select copy from sale), 500) as id;

select lives_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from sale_l), (select buyer from who)),
  'an open listing sells to a funded buyer');

select is(
  (select balance from betting_profiles where discord_id = (select buyer from who)),
  4500::bigint, 'the buyer paid exactly the asking price');

select is(
  (select balance from betting_profiles where discord_id = (select seller from who)),
  500::bigint, 'and the seller was paid exactly the asking price');

select is(
  (select count(*) from betting_ledger
    where reason = 'card_sale' and ref_table = 'card_listings' and ref_id = (select id from sale_l)),
  2::bigint, 'one sale writes two ledger rows — money never appears or vanishes');

select is(
  (select sum(delta)::bigint from betting_ledger
    where reason = 'card_sale' and ref_table = 'card_listings' and ref_id = (select id from sale_l)),
  0::bigint, 'and they sum to zero: this is a transfer, not a payout');

select is(
  (select discord_id from card_inventory where id = (select copy from sale)),
  (select buyer from who), 'the copy is the buyer''s now');

select is(
  (select status from card_listings where id = (select id from sale_l)),
  'sold', 'the listing is closed as sold');

select is(
  (select buyer_discord from card_listings where id = (select id from sale_l)),
  (select buyer from who), 'and it records who bought it');

select isnt(
  (select decided_at from card_listings where id = (select id from sale_l)),
  null, 'and when');

-- ==== a sold listing is sold once ==========================================

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from sale_l), (select stranger from who)),
  'P0001',
  'listing is not open',
  'a second buyer of the same listing is refused — the lock on the row is what makes this true under a race');

-- ==== insufficient balance leaves everything exactly where it was ==========

create temp table broke as
  select mk_copy((select seller from who)) as copy;
create temp table broke_l as
  select mk_listing((select seller from who), (select copy from broke), 500) as id;

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from broke_l), (select pauper from who)),
  'P0001',
  'insufficient balance',
  'a buyer who cannot cover the ask is refused');

select is(
  (select balance from betting_profiles where discord_id = (select pauper from who)),
  10::bigint, 'the pauper still has every dollar they had');

select is(
  (select balance from betting_profiles where discord_id = (select seller from who)),
  500::bigint, 'the seller was not paid for a sale that did not happen');

select is(
  (select discord_id from card_inventory where id = (select copy from broke)),
  (select seller from who), 'and the copy never left the seller''s shelf');

select is(
  (select status from card_listings where id = (select id from broke_l)),
  'open', 'the listing is still open — a failed sale is not a decision');

select is(
  (select count(*) from betting_ledger
    where reason = 'card_sale' and ref_table = 'card_listings' and ref_id = (select id from broke_l)),
  0::bigint, 'and no ledger row was written for it');

-- ==== the seller no longer owns what they advertised =======================
-- Nothing is escrowed, so this is the ordinary case, not the exotic one: the
-- card was traded or gifted away after the listing went up.

create temp table gone as
  select mk_copy((select seller from who)) as copy;
create temp table gone_l as
  select mk_listing((select seller from who), (select copy from gone), 500) as id;
update card_inventory set discord_id = (select stranger from who) where id = (select copy from gone);

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from gone_l), (select buyer from who)),
  'P0001',
  'card not owned',
  'a listing whose copy has moved on is stale, and the sale is refused rather than half-executed');

select is(
  (select balance from betting_profiles where discord_id = (select buyer from who)),
  4500::bigint, 'the buyer paid nothing for a card the seller could not deliver');

-- ==== expiry is checked at buy time, not just on the board =================

create temp table old as
  select mk_copy((select seller from who)) as copy;
create temp table old_l as
  select mk_listing((select seller from who), (select copy from old), 500, interval '-1 day') as id;

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from old_l), (select buyer from who)),
  'P0001',
  'listing expired',
  'a listing past its fourteen days cannot be bought, however long the page has been open');

-- ==== you cannot buy from yourself =========================================
-- Its own live listing, not the expired one above: expiry is checked first,
-- so reusing that row would have proved nothing about this rule.

create temp table mine as
  select mk_copy((select seller from who)) as copy;
create temp table mine_l as
  select mk_listing((select seller from who), (select copy from mine), 500) as id;

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from mine_l), (select seller from who)),
  'P0001',
  'cannot buy your own listing',
  'buying your own listing is refused (it would be two ledger rows for nothing)');

-- ==== one open listing per copy ============================================

create temp table twice as
  select mk_copy((select seller from who)) as copy;
create temp table twice_l as
  select mk_listing((select seller from who), (select copy from twice), 500) as id;

select throws_ok(
  format($$select mk_listing(%L, %s, 700)$$, (select seller from who), (select copy from twice)),
  '23505',
  null,
  'a copy can only be on the market once — the database refuses the second open listing');

-- A closed listing frees the copy to be listed again.
update card_listings set status = 'cancelled', decided_at = now() where id = (select id from twice_l);
select lives_ok(
  format($$select mk_listing(%L, %s, 700)$$, (select seller from who), (select copy from twice)),
  'and relisting it after the first is cancelled is fine');

-- ==== wants: the happy path ================================================

create temp table want as
  with w as (
    insert into public.card_wants (season, discord_id, slug, bounty)
    values ('S5', (select poster from who), 'spies-na1', 800)
    returning id
  ) select id from w;

create temp table want_copy as
  select mk_copy((select seller from who), 'spies-na1') as copy;

select lives_ok(
  format($$select public.fill_card_want(%s, %L, %s)$$,
         (select id from want), (select seller from who), (select copy from want_copy)),
  'a matching copy fills an open want');

select is(
  (select balance from betting_profiles where discord_id = (select poster from who)),
  2200::bigint, 'the poster paid the bounty they set');

select is(
  (select balance from betting_profiles where discord_id = (select seller from who)),
  1300::bigint, 'the filler was paid it');

select is(
  (select discord_id from card_inventory where id = (select copy from want_copy)),
  (select poster from who), 'and the copy is the poster''s');

select is(
  (select status from card_wants where id = (select id from want)),
  'filled', 'the want is closed as filled');

select is(
  (select filled_inventory_id from card_wants where id = (select id from want)),
  (select copy from want_copy), 'recording which copy answered it');

select is(
  (select count(*) from betting_ledger
    where reason = 'card_sale' and ref_table = 'card_wants' and ref_id = (select id from want)),
  2::bigint, 'a fill is ledgered against the WANT, so "why did I lose 800?" has an answer');

select throws_ok(
  format($$select public.fill_card_want(%s, %L, %s)$$,
         (select id from want), (select seller from who), (select copy from want_copy)),
  'P0001',
  'want is not open',
  'and it can only be filled once');

-- ==== wants match on the player, not on any old card =======================

create temp table want2 as
  with w as (
    insert into public.card_wants (season, discord_id, slug, bounty)
    values ('S5', (select poster from who), 'kite-na1', 400)
    returning id
  ) select id from w;

create temp table wrong_copy as
  select mk_copy((select seller from who), 'doug-na1') as copy;

select throws_ok(
  format($$select public.fill_card_want(%s, %L, %s)$$,
         (select id from want2), (select seller from who), (select copy from wrong_copy)),
  'P0001',
  'card does not match the want',
  'a want for one player cannot be filled with a different one');

select is(
  (select status from card_wants where id = (select id from want2)),
  'open', 'and the want stays open, waiting for the right card');

select is(
  (select discord_id from card_inventory where id = (select copy from wrong_copy)),
  (select seller from who), 'the wrong card stayed where it was');

-- Nor may you fill your own want (it is your money on both sides).
create temp table own_copy as
  select mk_copy((select poster from who), 'kite-na1') as copy;
select throws_ok(
  format($$select public.fill_card_want(%s, %L, %s)$$,
         (select id from want2), (select poster from who), (select copy from own_copy)),
  'P0001',
  'cannot fill your own want',
  'and you cannot pay yourself your own bounty');

-- ==== a deployed copy is not for sale ======================================
-- card_inventory_expedition_guard (20260901000001) refuses the ownership
-- update from under the sale. The exception propagates and takes the whole
-- transaction with it, which is exactly right: the money must not move for a
-- card that cannot.

create temp table away as
  select mk_copy((select seller from who)) as copy;
create temp table away_l as
  select mk_listing((select seller from who), (select copy from away), 500) as id;

insert into public.expedition_runs (discord_id, season, tier, squad, shine, resolves_at)
values ((select seller from who), 'S5', 'scout',
        array[(select copy from away), -1::bigint, -2::bigint], 0, now() + interval '4 hours');

select throws_ok(
  format($$select public.buy_card_listing(%s, %L)$$, (select id from away_l), (select buyer from who)),
  'P0001',
  'card is on expedition',
  'a copy out on an expedition cannot be sold — the trigger refuses the transfer');

select is(
  (select balance from betting_profiles where discord_id = (select buyer from who)),
  4500::bigint, 'and the buyer was not charged for it');

select is(
  (select discord_id from card_inventory where id = (select copy from away)),
  (select seller from who), 'the copy is still the seller''s, still away');

-- ==== the RPCs are not reachable from the public API =======================

select ok(
  not has_function_privilege('anon', 'public.buy_card_listing(bigint, text)', 'execute'),
  'anon cannot execute buy_card_listing — these functions do not authenticate their caller');
select ok(
  not has_function_privilege('authenticated', 'public.fill_card_want(bigint, text, bigint)', 'execute'),
  'nor can authenticated fill a want');
select ok(
  has_function_privilege('service_role', 'public.execute_card_sale(bigint, text, text, bigint, text, bigint)', 'execute'),
  'only the service role, which trusted server code holds');

select * from finish();
rollback;
