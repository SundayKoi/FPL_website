-- Markets engine RPCs: place_bet, cashout_bet, lock_due_markets,
-- void_one_sided_markets, resolve_market_admin, cancel_market_admin,
-- create_market_admin, delete_market_admin. Ported assertions from
-- c:\fpl_gambling\tests\{test_place_bet,test_resolve_market,test_cancel_market,
-- test_draws,test_invariants}.py, restructured for pgTAP: local factory
-- functions replace the Python fixtures/conftest factories (both are
-- transactional and rolled back with the test).
begin;
create extension if not exists pgtap with schema extensions;

-- ---- local factories (transactional; gone at rollback) ---------------------

create or replace function test_profile(p_balance bigint default 0) returns text
language plpgsql as $$
declare v_id text := 'u_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20);
begin
  insert into betting_profiles(discord_id, username, balance) values (v_id, v_id, p_balance);
  if p_balance <> 0 then
    insert into betting_ledger(discord_id, delta, reason) values (v_id, p_balance, 'seed');
  end if;
  return v_id;
end;
$$;

create or replace function test_market(
  p_event bigint, p_team_a bigint, p_team_b bigint,
  p_rake_bps int default 0, p_lock_offset interval default interval '1 hour',
  p_status text default 'OPEN', p_draw_enabled boolean default false
) returns bigint
language sql as $$
  insert into betting_markets(event_id, team_a_id, team_b_id, status, game_at, lock_at, rake_bps, draw_enabled)
  values (p_event, p_team_a, p_team_b, p_status,
          now() + p_lock_offset + interval '5 minutes', now() + p_lock_offset,
          p_rake_bps, p_draw_enabled)
  returning id;
$$;

select plan(46);

-- shared read-only fixtures: one event, three teams (a/b in-market, "other"
-- to exercise the not-in-market rejection). Markets/wallets are created
-- fresh per scenario since the RPCs under test mutate them.
create temp table fx as
with e as (insert into betting_events(name) values ('Fixture Event') returning id),
     ta as (insert into betting_teams(name, short_code) values ('Team A','TA') returning id),
     tb as (insert into betting_teams(name, short_code) values ('Team B','TB') returning id),
     tc as (insert into betting_teams(name, short_code) values ('Team C','TC') returning id)
select e.id as event_id, ta.id as team_a, tb.id as team_b, tc.id as other_team
from e, ta, tb, tc;

create temp table act as select test_profile(0) as actor;

-- ==== place_bet ==============================================================

create temp table s1 as select test_profile(1000) as u;
create temp table s1m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select is(
  (select place_bet((select u from s1), (select m from s1m), (select team_a from fx), 300)),
  700::bigint, 'place_bet returns new balance'
);
select is((select balance from betting_profiles where discord_id=(select u from s1)), 700::bigint, 'stake debits balance');
select is((select sum(delta) from betting_ledger where discord_id=(select u from s1)), 700::numeric, 'ledger matches debited balance');
select is((select amount from betting_bets where market_id=(select m from s1m)), 300::bigint, 'bet amount recorded');
select is((select team_id from betting_bets where market_id=(select m from s1m)), (select team_a from fx), 'bet team recorded');
select is((select settled from betting_bets where market_id=(select m from s1m)), false, 'bet starts unsettled');

create temp table s2 as select test_profile(100) as u;
create temp table s2m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select throws_like(
  format('select place_bet(%L,%s,%s,300)', (select u from s2), (select m from s2m), (select team_a from fx)),
  '%insufficient balance%', 'insufficient funds rejected'
);

create temp table s3 as select test_profile(1000) as u;
create temp table s3m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'LOCKED') as m;
select throws_like(
  format('select place_bet(%L,%s,%s,100)', (select u from s3), (select m from s3m), (select team_a from fx)),
  '%not open%', 'bet on non-open market rejected'
);

create temp table s4 as select test_profile(1000) as u;
create temp table s4m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '-60 seconds', 'OPEN') as m;
select throws_like(
  format('select place_bet(%L,%s,%s,100)', (select u from s4), (select m from s4m), (select team_a from fx)),
  '%locked%', 'bet after lock_at rejected'
);

create temp table s5 as select test_profile(1000) as u;
create temp table s5m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select throws_like(
  format('select place_bet(%L,%s,%s,100)', (select u from s5), (select m from s5m), (select other_team from fx)),
  '%not in market%', 'bet on team not in market rejected'
);

-- ==== resolve_market_admin: basic pro-rata payout ============================

create temp table s6 as select test_profile(1000) as w, test_profile(1000) as l;
create temp table s6m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select place_bet((select w from s6),(select m from s6m),(select team_a from fx),1000);
select place_bet((select l from s6),(select m from s6m),(select team_b from fx),1000);
select resolve_market_admin((select actor from act), (select m from s6m), (select team_a from fx));
select is((select balance from betting_profiles where discord_id=(select w from s6)), 2000::bigint, 'winner paid stake + losing pool');
select is((select balance from betting_profiles where discord_id=(select l from s6)), 0::bigint, 'loser balance drained');
select is((select payout from betting_bets where discord_id=(select w from s6)), 2000::bigint, 'winner payout recorded');
select is((select settled from betting_bets where discord_id=(select l from s6)), true, 'loser bet marked settled');
select resolve_market_admin((select actor from act), (select m from s6m), (select team_a from fx));
select is((select balance from betting_profiles where discord_id=(select w from s6)), 2000::bigint, 'resolve is idempotent');

-- ==== resolve_market_admin: nobody on the winning side voids =================

create temp table s7 as select test_profile(1000) as u;
create temp table s7m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select place_bet((select u from s7),(select m from s7m),(select team_b from fx),1000);
select resolve_market_admin((select actor from act), (select m from s7m), (select team_a from fx));
select is((select balance from betting_profiles where discord_id=(select u from s7)), 1000::bigint, 'nobody-on-winner -> full refund');
select is((select status from betting_markets where id=(select m from s7m)), 'RESOLVED', 'voided market still marked RESOLVED');

-- ==== cancel_market_admin =====================================================

create temp table s8 as select test_profile(1000) as u1, test_profile(500) as u2;
create temp table s8m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select place_bet((select u1 from s8),(select m from s8m),(select team_a from fx),400);
select place_bet((select u2 from s8),(select m from s8m),(select team_b from fx),500);
select cancel_market_admin((select actor from act), (select m from s8m));
select is((select balance from betting_profiles where discord_id=(select u1 from s8)), 1000::bigint, 'cancel refunds first stake');
select is((select balance from betting_profiles where discord_id=(select u2 from s8)), 500::bigint, 'cancel refunds second stake');
select is((select status from betting_markets where id=(select m from s8m)), 'CANCELLED', 'market marked cancelled');
select cancel_market_admin((select actor from act), (select m from s8m));
select is((select balance from betting_profiles where discord_id=(select u1 from s8)), 1000::bigint, 'cancel is idempotent');

-- ==== draws ====================================================================

create temp table s9 as select test_profile(1000) as u;
create temp table s9m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', true) as m;
select place_bet((select u from s9),(select m from s9m), -1, 200);
select is((select is_draw from betting_bets where discord_id=(select u from s9)), true, 'draw bet recorded is_draw');
select is((select team_id from betting_bets where discord_id=(select u from s9)), null::bigint, 'draw bet has null team_id');

create temp table s9off as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', false) as m;
select throws_like(
  format('select place_bet(%L,%s,-1,100)', (select u from s9), (select m from s9off)),
  '%no draw option%', 'draw bet rejected when draw_enabled=false'
);

create temp table s10 as select test_profile(1000) as d1, test_profile(1000) as d2, test_profile(1000) as ta;
create temp table s10m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', true) as m;
select place_bet((select d1 from s10),(select m from s10m), -1, 300);
select place_bet((select d2 from s10),(select m from s10m), -1, 100);
select place_bet((select ta from s10),(select m from s10m),(select team_a from fx), 400);
select resolve_market_admin((select actor from act), (select m from s10m), -1);
select is((select balance from betting_profiles where discord_id=(select d1 from s10)), 1300::bigint, 'draw pool splits pro-rata (d1)');
select is((select balance from betting_profiles where discord_id=(select d2 from s10)), 1100::bigint, 'draw pool splits pro-rata (d2)');
select is((select balance from betting_profiles where discord_id=(select ta from s10)), 600::bigint, 'team backer loses when draw wins');
select is((select drawn from betting_markets where id=(select m from s10m)), true, 'market marked drawn');
select is((select winning_team_id from betting_markets where id=(select m from s10m)), null::bigint, 'winning_team_id null on draw');

create temp table s11 as select test_profile(1000) as backer, test_profile(1000) as drawer;
create temp table s11m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', true) as m;
select place_bet((select backer from s11),(select m from s11m),(select team_a from fx), 500);
select place_bet((select drawer from s11),(select m from s11m), -1, 500);
select resolve_market_admin((select actor from act), (select m from s11m), (select team_a from fx));
select is((select balance from betting_profiles where discord_id=(select backer from s11)), 1500::bigint, 'team winner takes the draw pool');
select is((select balance from betting_profiles where discord_id=(select drawer from s11)), 500::bigint, 'draw backer loses stake when team wins');
select is((select drawn from betting_markets where id=(select m from s11m)), false, 'market not marked drawn');

create temp table s12 as select test_profile(1000) as ta, test_profile(1000) as tb;
create temp table s12m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', true) as m;
select place_bet((select ta from s12),(select m from s12m),(select team_a from fx), 300);
select place_bet((select tb from s12),(select m from s12m),(select team_b from fx), 400);
select resolve_market_admin((select actor from act), (select m from s12m), -1);
select is((select balance from betting_profiles where discord_id=(select ta from s12)), 1000::bigint, 'draw wins but unbacked -> void refund a');
select is((select balance from betting_profiles where discord_id=(select tb from s12)), 1000::bigint, 'draw wins but unbacked -> void refund b');

create temp table s13 as select test_profile(1000) as u;
create temp table s13m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '1 hour', 'OPEN', true) as m;
select place_bet((select u from s13),(select m from s13m), -1, 400);
create temp table s13b as select id as bet_id from betting_bets where discord_id=(select u from s13);
select is((select cashout_bet((select u from s13), (select bet_id from s13b))), 980::bigint, 'cashout refunds stake minus 5% fee');
select is((select count(*) from betting_bets where id=(select bet_id from s13b)), 0::bigint, 'cashed-out bet is deleted');

-- ==== lock_due_markets / void_one_sided_markets ================================

create temp table s14m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '-30 seconds', 'OPEN') as m;
select ok((select m from s14m) = any(array(select lock_due_markets())), 'lock_due_markets returns the flipped id');
select is((select status from betting_markets where id=(select m from s14m)), 'LOCKED', 'lock_due_markets flips status to LOCKED');

create temp table s15 as select test_profile(1000) as u;
create temp table s15m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '-30 seconds', 'OPEN') as m;
insert into betting_bets(market_id, discord_id, team_id, amount) values ((select m from s15m), (select u from s15), (select team_a from fx), 500);
insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
  select (select u from s15), -500, 'bet_place', 'betting_bets', id from betting_bets where market_id=(select m from s15m);
update betting_profiles set balance = balance - 500 where discord_id=(select u from s15);
select ok((select m from s15m) = any(array(select void_one_sided_markets())), 'void_one_sided_markets returns the voided id');
select is((select balance from betting_profiles where discord_id=(select u from s15)), 1000::bigint, 'one-sided bettor refunded');
select is((select status from betting_markets where id=(select m from s15m)), 'CANCELLED', 'one-sided market cancelled');

-- ==== create_market_admin / delete_market_admin =================================

create temp table s16m as select create_market_admin(
  (select actor from act), (select event_id from fx), (select team_a from fx), (select team_b from fx),
  'Test Market', 'Rules', now() + interval '2 hours', 300, null, false
) as m;
select is(
  (select count(*) from betting_admin_audit where action='market_create' and target='betting_markets:' || (select m from s16m)),
  1::bigint, 'create_market_admin writes an audit row'
);
select delete_market_admin((select actor from act), (select m from s16m));
select is((select count(*) from betting_markets where id=(select m from s16m)), 0::bigint, 'delete_market_admin removes an empty market');
select is((select count(*) from betting_admin_audit where action='market_delete'), 1::bigint, 'delete_market_admin writes an audit row');

create temp table s17 as select test_profile(1000) as u;
create temp table s17m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select place_bet((select u from s17),(select m from s17m),(select team_a from fx), 100);
select throws_like(
  format('select delete_market_admin(%L,%s)', (select actor from act), (select m from s17m)),
  '%cancel it instead%', 'delete_market_admin refuses a market with bets'
);
select cancel_market_admin((select actor from act), (select m from s17m));

-- ==== invariant: sum(ledger.delta) = balance for every wallet touched ===========

select is(
  (select count(*) from betting_profiles p
     where p.balance <> coalesce((select sum(delta) from betting_ledger l where l.discord_id = p.discord_id), 0)),
  0::bigint,
  'ledger invariant holds for every wallet touched'
);

select * from finish();
rollback;
