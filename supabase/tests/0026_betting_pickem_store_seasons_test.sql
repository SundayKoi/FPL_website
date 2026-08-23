-- Pick'em, store, seasons RPCs. Ported assertions from
-- c:\fpl_gambling\tests\{test_pickem_cashout,test_purchase_item,test_seasons}.py,
-- restructured for pgTAP: local factory functions replace the Python
-- fixtures/conftest factories (both are transactional and rolled back with
-- the test).
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc

select plan(59);

create temp table act as select test_profile(0) as actor;

-- ==== create_pickem_admin / place_pickem_card =================================

create temp table night1 as select test_night(3) as e;
create temp table legs1 as
  select m.id as market_id, m.team_a_id, m.team_b_id
  from betting_markets m where m.event_id = (select e from night1) order by m.id;

create temp table p1 as select create_pickem_admin(
  (select actor from act), (select e from night1), 'Night Pick''em',
  (select array_agg(market_id order by market_id) from legs1)
) as pickem_id;

select is(
  (select carryover from betting_pickems where id = (select pickem_id from p1)),
  0::bigint, 'new pick''em claims zero carryover from an empty bank'
);

select throws_like(
  format('select create_pickem_admin(%L,%s,%L,array[%s]::bigint[])',
    (select actor from act), (select e from night1), 'too few',
    (select market_id from legs1 limit 1)),
  '%at least 2%', 'create_pickem_admin needs at least 2 legs'
);

-- place a card for each of three players: two perfect, one 2/3
create temp table win1 as select test_profile(1000) as u;
create temp table win2 as select test_profile(1000) as u;
create temp table lose1 as select test_profile(1000) as u;

create temp table right_picks as
  select jsonb_object_agg(market_id::text, team_a_id) as picks from legs1;

select is(
  (select place_pickem_card((select u from win1), (select pickem_id from p1), (select picks from right_picks), 300)),
  700::bigint, 'place_pickem_card debits stake, returns new balance'
);
select place_pickem_card((select u from win2), (select pickem_id from p1), (select picks from right_picks), 100);

-- lose1 picks team_b on the last leg only
create temp table lose_picks as
  select (select picks from right_picks) || jsonb_build_object(
    (select market_id::text from legs1 order by market_id desc limit 1),
    (select team_b_id from legs1 order by market_id desc limit 1)
  ) as picks;
select place_pickem_card((select u from lose1), (select pickem_id from p1), (select picks from lose_picks), 600);

select is((select sum(delta) from betting_ledger where discord_id=(select u from win1)), 700::numeric, 'pickem_place ledger matches debit');
select is((select count(*) from betting_ledger where discord_id=(select u from win1) and reason='pickem_place'), 1::bigint, 'ledger reason is pickem_place');

-- validation: incomplete picks rejected
select throws_like(
  format('select place_pickem_card(%L,%s,%L::jsonb,100)',
    (select u from lose1), (select pickem_id from p1),
    jsonb_build_object((select market_id::text from legs1 limit 1), (select team_a_id from legs1 limit 1))::text),
  '%every series%', 'incomplete picks rejected'
);

-- replacing a card refunds the old stake first
create temp table replace_result as select place_pickem_card(
  (select u from lose1), (select pickem_id from p1), (select picks from right_picks), 250
) as bal;
select is((select bal from replace_result), (1000 - 600 + 600 - 250)::bigint, 'replacing a card refunds the old stake, charges the new one');
select is((select count(*) from betting_pickem_cards where pickem_id=(select pickem_id from p1) and discord_id=(select u from lose1)), 1::bigint, 'replacing a card leaves exactly one row');

-- ==== resolve_pickem: perfect cards split the pool (with carryover) ==========

update betting_pickem_bank set balance = 900 where id = 1;
create temp table night2 as select test_night(3) as e;
create temp table legs2 as
  select m.id as market_id, m.team_a_id, m.team_b_id
  from betting_markets m where m.event_id=(select e from night2) order by m.id;
create temp table p2 as select create_pickem_admin(
  (select actor from act), (select e from night2), 'Night 2',
  (select array_agg(market_id order by market_id) from legs2)
) as pickem_id;
select is((select carryover from betting_pickems where id=(select pickem_id from p2)), 900::bigint, 'pick''em claims the bank as carryover');
select is((select balance from betting_pickem_bank where id=1), 0::bigint, 'bank zeroed after claim');

create temp table pw1 as select test_profile(1000) as u;
create temp table pw2 as select test_profile(1000) as u;
create temp table pl as select test_profile(1000) as u;

create temp table right2 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs2;
create temp table wrong2 as
  select (select picks from right2) || jsonb_build_object(
    (select market_id::text from legs2 order by market_id desc limit 1),
    (select team_b_id from legs2 order by market_id desc limit 1)
  ) as picks;

select place_pickem_card((select u from pw1), (select pickem_id from p2), (select picks from right2), 300);
select place_pickem_card((select u from pw2), (select pickem_id from p2), (select picks from right2), 100);
select place_pickem_card((select u from pl), (select pickem_id from p2), (select picks from wrong2), 600);

select resolve_market_admin((select actor from act), market_id, team_a_id) from legs2;
select resolve_pickem((select pickem_id from p2));
select resolve_pickem((select pickem_id from p2));  -- idempotent

-- pool = 300+100+600 stakes + 900 carryover = 1900; split 3:1
select is((select balance from betting_profiles where discord_id=(select u from pw1)), (1000 - 300 + 1425)::bigint, 'perfect card 1 gets pro-rata share of pool+carryover');
select is((select balance from betting_profiles where discord_id=(select u from pw2)), (1000 - 100 + 475)::bigint, 'perfect card 2 gets pro-rata share of pool+carryover');
select is((select balance from betting_profiles where discord_id=(select u from pl)), 400::bigint, 'imperfect card gets nothing back');
select is((select status from betting_pickems where id=(select pickem_id from p2)), 'RESOLVED', 'pick''em marked resolved');
select is((select count(*) from betting_ledger where discord_id=(select u from pw1) and reason='pickem_payout'), 1::bigint, 'winner ledger reason is pickem_payout');

-- ==== resolve_pickem: no perfect card rolls the whole pool into the bank ====

create temp table night3 as select test_night(3) as e;
create temp table legs3 as
  select m.id as market_id, m.team_a_id, m.team_b_id
  from betting_markets m where m.event_id=(select e from night3) order by m.id;
create temp table p3 as select create_pickem_admin(
  (select actor from act), (select e from night3), 'Night 3',
  (select array_agg(market_id order by market_id) from legs3)
) as pickem_id;

create temp table u1 as select test_profile(1000) as u;
create temp table u2 as select test_profile(1000) as u;
create temp table right3 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs3;
create temp table wrong3a as
  select (select picks from right3) || jsonb_build_object(
    (select market_id::text from legs3 order by market_id desc limit 1),
    (select team_b_id from legs3 order by market_id desc limit 1)
  ) as picks;
create temp table wrong3b as
  select (select picks from right3) || jsonb_build_object(
    (select market_id::text from legs3 order by market_id limit 1),
    (select team_b_id from legs3 order by market_id limit 1)
  ) as picks;

select place_pickem_card((select u from u1), (select pickem_id from p3), (select picks from wrong3a), 500);
select place_pickem_card((select u from u2), (select pickem_id from p3), (select picks from wrong3b), 400);
select resolve_market_admin((select actor from act), market_id, team_a_id) from legs3;
select resolve_pickem((select pickem_id from p3));

select is((select balance from betting_pickem_bank where id=1), 900::bigint, 'no-perfect-card pool rolls entirely into the bank');
select is((select balance from betting_profiles where discord_id=(select u from u1)), 500::bigint, 'losing card 1 balance unchanged (already staked)');
select is((select balance from betting_profiles where discord_id=(select u from u2)), 600::bigint, 'losing card 2 balance unchanged (already staked)');

-- ==== resolve_pickem: blocked until every leg is settled ======================

create temp table night4 as select test_night(2) as e;
create temp table legs4 as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night4) order by m.id;
create temp table p4 as select create_pickem_admin(
  (select actor from act), (select e from night4), 'Night 4', (select array_agg(market_id order by market_id) from legs4)
) as pickem_id;
select resolve_market_admin((select actor from act), (select market_id from legs4 order by market_id limit 1), (select team_a_id from legs4 order by market_id limit 1));
select throws_like(
  format('select resolve_pickem(%s)', (select pickem_id from p4)),
  '%unresolved series%', 'resolve_pickem blocks until every leg is settled'
);

-- ==== cancel_pickem_admin: refunds cards and returns carryover ================

update betting_pickem_bank set balance = 700 where id=1;
create temp table night5 as select test_night(3) as e;
create temp table legs5 as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night5) order by m.id;
create temp table p5 as select create_pickem_admin(
  (select actor from act), (select e from night5), 'Night 5', (select array_agg(market_id order by market_id) from legs5)
) as pickem_id;
create temp table u5 as select test_profile(1000) as u;
create temp table picks5 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs5;
select place_pickem_card((select u from u5), (select pickem_id from p5), (select picks from picks5), 300);
select cancel_pickem_admin((select actor from act), (select pickem_id from p5));
select is((select balance from betting_profiles where discord_id=(select u from u5)), 1000::bigint, 'cancel_pickem_admin refunds the stake');
select is((select balance from betting_pickem_bank where id=1), 700::bigint, 'cancel_pickem_admin returns the carryover to the bank');
select is((select status from betting_pickems where id=(select pickem_id from p5)), 'CANCELLED', 'cancelled pick''em marked CANCELLED');
select is((select count(*) from betting_admin_audit where action='pickem_cancel'), 1::bigint, 'cancel_pickem_admin writes an audit row');

-- ==== lock_due_pickems / pickem_near_misses / pickem_summary ===================

update betting_pickem_bank set balance = 0 where id=1;  -- isolate from prior scenarios' carryover
create temp table night6 as select test_night(2) as e;
create temp table legs6 as
  select m.id as market_id, m.team_a_id, m.team_b_id from betting_markets m where m.event_id=(select e from night6) order by m.id;
create temp table p6 as select create_pickem_admin(
  (select actor from act), (select e from night6), 'Night 6', (select array_agg(market_id order by market_id) from legs6)
) as pickem_id;

-- place the near-miss card while the pick'em is still OPEN (lock_due_pickems
-- flips it LOCKED further down, and place_pickem_card refuses non-OPEN)
create temp table near1 as select test_profile(1000) as u;
create temp table picks6 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs6;
create temp table nearmiss_picks as
  select (select picks from picks6) || jsonb_build_object(
    (select market_id::text from legs6 order by market_id desc limit 1),
    (select team_b_id from legs6 order by market_id desc limit 1)
  ) as picks;
select place_pickem_card((select u from near1), (select pickem_id from p6), (select picks from nearmiss_picks), 100);

update betting_pickems set lock_at = now() - interval '1 minute' where id=(select pickem_id from p6);
select ok((select pickem_id from p6) = any(array(select lock_due_pickems())), 'lock_due_pickems returns the flipped id');
select is((select status from betting_pickems where id=(select pickem_id from p6)), 'LOCKED', 'lock_due_pickems flips status to LOCKED');

select resolve_market_admin((select actor from act), market_id, team_a_id) from legs6;
select resolve_pickem((select pickem_id from p6));
select is(
  (select array_agg(x) from pickem_near_misses((select pickem_id from p6)) as x),
  array[(select username from betting_profiles where discord_id=(select u from near1))],
  'pickem_near_misses lists the one-off card'
);
create temp table summary6 as select * from pickem_summary((select pickem_id from p6));
select is((select pool from summary6), 100::bigint, 'pickem_summary reports the pool');

-- ==== store: start_purchase / fulfill_purchase / refund_purchase ==============

create temp table item1 as
  with x as (insert into betting_store_items(name, cost, type, payload, active)
    values ('Role', 500, 'discord_role', '{"role_id":"123"}'::jsonb, true) returning id)
  select id from x;
create temp table buyer1 as select test_profile(1000) as u;
create temp table purchase1 as select start_purchase((select u from buyer1), (select id from item1)) as pid;
select is((select balance from betting_profiles where discord_id=(select u from buyer1)), 500::bigint, 'start_purchase debits the cost');
select is((select sum(delta) from betting_ledger where discord_id=(select u from buyer1)), 500::numeric, 'start_purchase ledger matches debit');
select is((select cost from betting_purchases where id=(select pid from purchase1)), 500::bigint, 'purchase row records the cost');
select is((select fulfilled from betting_purchases where id=(select pid from purchase1)), false, 'purchase row starts unfulfilled');

select fulfill_purchase((select pid from purchase1), 'role:123');
select is((select fulfilled from betting_purchases where id=(select pid from purchase1)), true, 'fulfill_purchase marks fulfilled');
select fulfill_purchase((select pid from purchase1), 'role:123');  -- idempotent, no error
select throws_like(
  format('select refund_purchase(%s)', (select pid from purchase1)),
  '%already fulfilled%', 'refund_purchase refuses a fulfilled purchase'
);

create temp table item2 as
  with x as (insert into betting_store_items(name, cost, type, active)
    values ('Role 2', 600, 'discord_role', true) returning id)
  select id from x;
create temp table buyer2 as select test_profile(1000) as u;
create temp table purchase2 as select start_purchase((select u from buyer2), (select id from item2)) as pid;
select is((select refund_purchase((select pid from purchase2))), 1000::bigint, 'refund_purchase restores the balance');
select is(
  (select balance from betting_profiles where discord_id=(select u from buyer2)),
  (select coalesce(sum(delta),0)::bigint from betting_ledger where discord_id=(select u from buyer2)),
  'refund balance matches ledger sum'
);
select is((select refund_purchase((select pid from purchase2))), 1000::bigint, 'refund_purchase is idempotent');

-- store admin CRUD
create temp table item3 as select upsert_store_item_admin(
  (select actor from act), null, 'New Item', 'desc', 250, 'cosmetic', '{}'::jsonb, true
) as id;
select is((select count(*) from betting_store_items where id=(select id from item3)), 1::bigint, 'upsert_store_item_admin creates a row');
select upsert_store_item_admin((select actor from act), (select id from item3), 'Renamed', 'desc', 300, 'cosmetic', '{}'::jsonb, true);
select is((select name from betting_store_items where id=(select id from item3)), 'Renamed', 'upsert_store_item_admin updates a row');
select delete_store_item_admin((select actor from act), (select id from item3));
select is((select count(*) from betting_store_items where id=(select id from item3)), 0::bigint, 'delete_store_item_admin removes an unpurchased item');
select throws_like(
  format('select delete_store_item_admin(%L,%s)', (select actor from act), (select id from item1)),
  '%deactivate it instead%', 'delete_store_item_admin refuses an item with purchases'
);

-- ==== seasons: create / close (blocked / snapshot+reset) ======================

create temp table season1 as select create_season_admin((select actor from act), 'Split 1') as id;
select throws_like(
  format('select create_season_admin(%L,%L)', (select actor from act), 'Split 2'),
  '%already active%', 'only one active season at a time'
);

create temp table busy_night as select test_night(1) as e;  -- leaves an OPEN market behind
select throws_like(
  format('select close_season_admin(%L,%s,0)', (select actor from act), (select id from season1)),
  '%close all markets%', 'season close blocked while a market is open'
);

-- clear every still-open market/pick'em out of the way (this transaction's
-- earlier scenarios left several OPEN — none carry bets or cards, so a
-- direct status flip is safe) for the close-with-reset scenario below.
update betting_markets set status = 'CANCELLED' where status in ('OPEN', 'LOCKED');
update betting_pickems set status = 'CANCELLED' where status in ('OPEN', 'LOCKED');

create temp table rich as select test_profile(9000) as u;
create temp table mid as select test_profile(3000) as u;
create temp table poor as select test_profile(100) as u;
update betting_profiles set username = 'Rich' where discord_id = (select u from rich);
update betting_profiles set username = 'Mid' where discord_id = (select u from mid);
update betting_profiles set username = 'Poor' where discord_id = (select u from poor);

select close_season_admin((select actor from act), (select id from season1), 1000, 10);
select is((select status from betting_seasons where id=(select id from season1)), 'CLOSED', 'close_season_admin closes the season');
select is((select balance from betting_profiles where discord_id=(select u from rich)), 1000::bigint, 'close_season_admin soft-resets the rich wallet to reset_to');
select is((select balance from betting_profiles where discord_id=(select u from poor)), 1000::bigint, 'close_season_admin soft-resets the poor wallet to reset_to');
select is(
  (select rank from betting_season_results where season_id=(select id from season1) and discord_id=(select u from rich)),
  1, 'season_results snapshots the pre-reset podium (rich is rank 1)'
);
select is((select count(*) from betting_ledger where discord_id=(select u from rich) and reason='season_reset'), 1::bigint, 'soft reset recorded with reason season_reset');
select close_season_admin((select actor from act), (select id from season1), 1000, 10);
select is((select balance from betting_profiles where discord_id=(select u from rich)), 1000::bigint, 'close_season_admin is idempotent per season');

-- ==== execute privilege lockdown: entire betting RPC surface is service_role-only

select is(has_function_privilege('anon', 'public.place_pickem_card(text,bigint,jsonb,bigint)', 'execute'), false, 'anon cannot execute place_pickem_card');
select is(has_function_privilege('authenticated', 'public.place_pickem_card(text,bigint,jsonb,bigint)', 'execute'), false, 'authenticated cannot execute place_pickem_card');
select is(has_function_privilege('service_role', 'public.place_pickem_card(text,bigint,jsonb,bigint)', 'execute'), true, 'service_role can execute place_pickem_card');

select is(has_function_privilege('anon', 'public.resolve_pickem(bigint)', 'execute'), false, 'anon cannot execute resolve_pickem');
select is(has_function_privilege('authenticated', 'public.resolve_pickem(bigint)', 'execute'), false, 'authenticated cannot execute resolve_pickem');
select is(has_function_privilege('service_role', 'public.resolve_pickem(bigint)', 'execute'), true, 'service_role can execute resolve_pickem');

select is(has_function_privilege('anon', 'public.close_season_admin(text,bigint,bigint,int)', 'execute'), false, 'anon cannot execute close_season_admin');
select is(has_function_privilege('service_role', 'public.close_season_admin(text,bigint,bigint,int)', 'execute'), true, 'service_role can execute close_season_admin');

select is(has_function_privilege('anon', 'public.start_purchase(text,bigint)', 'execute'), false, 'anon cannot execute start_purchase');
select is(has_function_privilege('service_role', 'public.start_purchase(text,bigint)', 'execute'), true, 'service_role can execute start_purchase');

-- ==== invariant: sum(ledger.delta) = balance for every wallet touched ===========

select is(
  (select count(*) from betting_profiles p
     where p.balance <> coalesce((select sum(delta) from betting_ledger l where l.discord_id = p.discord_id), 0)),
  0::bigint,
  'ledger invariant holds for every wallet touched'
);

select * from finish();
rollback;
