-- The 250 floor under every stake
-- (20261016000001_betting_minimum_stake.sql): both ways into the pools,
-- both sides of the boundary, and the checks that already stood.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc

select plan(14);

create temp table fx as
with e as (insert into betting_events(name) values ('Floor Event') returning id),
     ta as (insert into betting_teams(name, short_code) values ('Floor A','FA') returning id),
     tb as (insert into betting_teams(name, short_code) values ('Floor B','FB') returning id)
select e.id as event_id, ta.id as team_a, tb.id as team_b from e, ta, tb;

create temp table act as select test_profile(0) as actor;

-- ==== place_bet ==============================================================

create temp table b1 as select test_profile(1000) as u;
create temp table b1m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;

select throws_like(
  format('select place_bet(%L,%s,%s,249)', (select u from b1), (select m from b1m), (select team_a from fx)),
  '%minimum stake is 250%', 'a bet one dollar under the floor is rejected'
);
select is(
  (select count(*) from betting_bets where market_id=(select m from b1m)),
  0::bigint, 'the rejected bet left no row behind'
);
select is(
  (select balance from betting_profiles where discord_id=(select u from b1)),
  1000::bigint, 'the rejected bet took nothing from the wallet'
);
select is(
  (select place_bet((select u from b1), (select m from b1m), (select team_a from fx), 250)),
  750::bigint, 'a bet exactly at the floor is accepted'
);

-- the floor is per bet, not per market: a second stake stands on its own
select throws_like(
  format('select place_bet(%L,%s,%s,100)', (select u from b1), (select m from b1m), (select team_a from fx)),
  '%minimum stake is 250%', 'a top-up under the floor is rejected even with a bet already down'
);

-- zero and negative still read as the older, plainer mistake
select throws_like(
  format('select place_bet(%L,%s,%s,0)', (select u from b1), (select m from b1m), (select team_a from fx)),
  '%amount must be positive%', 'zero is still "amount must be positive", not the floor'
);

-- the floor is the amount asked for, checked before the wallet: a bettor
-- who cannot afford 250 hears about their balance, as they always did
create temp table b2 as select test_profile(100) as u;
create temp table b2m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select throws_like(
  format('select place_bet(%L,%s,%s,250)', (select u from b2), (select m from b2m), (select team_a from fx)),
  '%insufficient balance%', 'a wallet under the floor still fails on balance'
);

-- ==== place_pickem_card ======================================================

create temp table night as select test_night(2) as e;
create temp table legs as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night) order by m.id;
create temp table pk as select create_pickem_admin(
  (select actor from act), (select e from night), 'Floor Night',
  (select array_agg(market_id order by market_id) from legs)
) as pickem_id;
create temp table pk_picks as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs;

create temp table c1 as select test_profile(1000) as u;
select throws_like(
  format('select place_pickem_card(%L,%s,%L::jsonb,249)',
    (select u from c1), (select pickem_id from pk), (select picks from pk_picks)::text),
  '%minimum stake is 250%', 'a card one dollar under the floor is rejected'
);
select is(
  (select count(*) from betting_pickem_cards where pickem_id=(select pickem_id from pk)),
  0::bigint, 'the rejected card left no row behind'
);
select is(
  (select balance from betting_profiles where discord_id=(select u from c1)),
  1000::bigint, 'the rejected card took nothing from the wallet'
);
select is(
  (select place_pickem_card((select u from c1), (select pickem_id from pk), (select picks from pk_picks), 250)),
  750::bigint, 'a card exactly at the floor is accepted'
);

-- a replacement card is a new stake, so it faces the floor too — and the
-- refund of the old one happens after the check, never before it
select throws_like(
  format('select place_pickem_card(%L,%s,%L::jsonb,249)',
    (select u from c1), (select pickem_id from pk), (select picks from pk_picks)::text),
  '%minimum stake is 250%', 'replacing a card down to under the floor is rejected'
);
select is(
  (select amount from betting_pickem_cards where pickem_id=(select pickem_id from pk) and discord_id=(select u from c1)),
  250::bigint, 'the standing card survives the rejected replacement'
);
select is(
  (select balance from betting_profiles where discord_id=(select u from c1)),
  750::bigint, 'the rejected replacement refunded nothing'
);

select * from finish();
rollback;
