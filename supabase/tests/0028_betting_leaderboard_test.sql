-- betting_leaderboard view. Ported assertions from
-- c:\fpl_gambling\tests\test_stats.py (player_stats/leaderboard_badges core
-- cases), restructured for pgTAP: local factory functions replace the Python
-- fixtures/conftest factories (both are transactional and rolled back with
-- the test).
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

-- a settled bet writing the same ledger rows the RPCs would (bet_place debit
-- + bet_payout credit) so profit/wins/streak read exactly as in production.
create or replace function test_settled_bet(
  p_user text, p_market bigint, p_team bigint, p_amount bigint, p_payout bigint
) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into betting_bets(market_id, discord_id, team_id, amount, payout, settled)
    values (p_market, p_user, p_team, p_amount, p_payout, true)
    returning id into v_id;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_amount, 'bet_place', 'betting_bets', v_id);
  if p_payout <> 0 then
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, p_payout, 'bet_payout', 'betting_bets', v_id);
  end if;
  return v_id;
end;
$$;

-- an "event night": n open markets sharing one event, each with two teams
create or replace function test_night(p_n int default 3) returns bigint
language plpgsql as $$
declare
  v_event bigint;
  v_a bigint; v_b bigint;
begin
  insert into betting_events(name) values ('Fixture Night') returning id into v_event;
  for i in 1..p_n loop
    insert into betting_teams(name, short_code) values ('T' || (2*i-1), 'A' || i) returning id into v_a;
    insert into betting_teams(name, short_code) values ('T' || (2*i), 'B' || i) returning id into v_b;
    perform test_market(v_event, v_a, v_b);
  end loop;
  return v_event;
end;
$$;

select plan(17);

create temp table act as select test_profile(0) as actor;

-- ==== wins/losses/biggest-win/streak: chronological win,win,loss,win =========
-- (mirrors test_player_stats_wins_losses_streak_biggest)

create temp table fx1 as
with e as (insert into betting_events(name) values ('Fixture 1') returning id),
     ta as (insert into betting_teams(name, short_code) values ('A1','A1') returning id),
     tb as (insert into betting_teams(name, short_code) values ('B1','B1') returning id)
select e.id as event_id, ta.id as team_a, tb.id as team_b from e, ta, tb;
create temp table m1 as select test_market((select event_id from fx1), (select team_a from fx1), (select team_b from fx1)) as m;
create temp table u1 as select test_profile(0) as u;

select test_settled_bet((select u from u1), (select m from m1), (select team_a from fx1), 100, 200);  -- +100
select test_settled_bet((select u from u1), (select m from m1), (select team_a from fx1), 200, 700);  -- +500
select test_settled_bet((select u from u1), (select m from m1), (select team_a from fx1), 300, 0);    -- -300
select test_settled_bet((select u from u1), (select m from m1), (select team_a from fx1), 100, 150);  -- +50

select is((select wins from betting_leaderboard where discord_id=(select u from u1)), 3::bigint, 'wins counts 3 winning settled bets');
select is((select losses from betting_leaderboard where discord_id=(select u from u1)), 1::bigint, 'losses counts 1 losing settled bet');
select is((select current_streak from betting_leaderboard where discord_id=(select u from u1)), 1::bigint, 'current_streak is the trailing run of wins (1)');
select is((select profit from betting_leaderboard where discord_id=(select u from u1)), (100+500-300+50)::bigint, 'profit nets stake+payout across every settled bet');

-- ==== refunds are neither win nor loss (payout = amount) =====================

create temp table u2 as select test_profile(0) as u;
select test_settled_bet((select u from u2), (select m from m1), (select team_a from fx1), 400, 400);  -- void refund
select test_settled_bet((select u from u2), (select m from m1), (select team_a from fx1), 100, 300);  -- win
select is((select wins from betting_leaderboard where discord_id=(select u from u2)), 1::bigint, 'a refund (payout=amount) is not counted as a win');
select is((select losses from betting_leaderboard where discord_id=(select u from u2)), 0::bigint, 'a refund (payout=amount) is not counted as a loss');
select is((select current_streak from betting_leaderboard where discord_id=(select u from u2)), 1::bigint, 'current_streak skips the refund and counts the win');

-- ==== cancelled market nets zero profit, not -stake ===========================

create temp table u3 as select test_profile(5000) as u;
create temp table m3 as select test_market((select event_id from fx1), (select team_a from fx1), (select team_b from fx1)) as m;
select place_bet((select u from u3), (select m from m3), (select team_a from fx1), 500);
select cancel_market_admin((select actor from act), (select m from m3));
select is((select profit from betting_leaderboard where discord_id=(select u from u3)), 0::bigint, 'a cancelled market nets zero profit (refund pairs with the stake)');

-- ==== voided (one-sided) market nets zero profit ==============================

create temp table u4 as select test_profile(5000) as u;
create temp table m4 as select test_market((select event_id from fx1), (select team_a from fx1), (select team_b from fx1)) as m;
select place_bet((select u from u4), (select m from m4), (select team_a from fx1), 500);
select resolve_market_admin((select actor from act), (select m from m4), (select team_b from fx1));  -- nobody backed the winner -> void
select is((select profit from betting_leaderboard where discord_id=(select u from u4)), 0::bigint, 'a voided (one-sided) market nets zero profit');

-- ==== daily bonus / tips are excluded from profit =============================

create temp table u5 as select test_profile(0) as u;
create temp table u6 as select test_profile(0) as u;
select claim_daily_streak((select u from u5), 100, 10, 30);
select tip_points((select u from u5), (select u from u6), 50);
select is((select profit from betting_leaderboard where discord_id=(select u from u5)), 0::bigint, 'daily bonus and tip-send are excluded from profit');
select is((select profit from betting_leaderboard where discord_id=(select u from u6)), 0::bigint, 'tip-receive is excluded from profit');

-- ==== perfect pick'ems: only resolved + paid cards count ======================
-- (mirrors test_perfect_pickem_counts_only_when_resolved_and_paid)

create temp table night1 as select test_night(2) as e;
create temp table legs1 as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night1) order by m.id;
create temp table p1 as select create_pickem_admin(
  (select actor from act), (select e from night1), 'Night', (select array_agg(market_id order by market_id) from legs1)
) as pickem_id;
create temp table u7 as select test_profile(1000) as u;
create temp table picks1 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs1;
select place_pickem_card((select u from u7), (select pickem_id from p1), (select picks from picks1), 200);
select is((select perfect_pickems from betting_leaderboard where discord_id=(select u from u7)), 0::bigint, 'perfect_pickems is 0 before the pick''em resolves');
select resolve_market_admin((select actor from act), market_id, team_a_id) from legs1;
select resolve_pickem((select pickem_id from p1));
select is((select perfect_pickems from betting_leaderboard where discord_id=(select u from u7)), 1::bigint, 'perfect_pickems counts the resolved, paid-out card');

-- ==== leaderboard badges: streak >=3 and perfect pick'ems (leaderboard_badges parity) ==

create temp table hot as select test_profile(0) as u;
create temp table cold as select test_profile(0) as u;
create temp table m8 as select test_market((select event_id from fx1), (select team_a from fx1), (select team_b from fx1)) as m;
select test_settled_bet((select u from hot), (select m from m8), (select team_a from fx1), 100, 200) from generate_series(1,3);
select test_settled_bet((select u from cold), (select m from m8), (select team_a from fx1), 100, 0);
select is((select current_streak from betting_leaderboard where discord_id=(select u from hot)), 3::bigint, 'a 3-win streak reads current_streak=3 (badge threshold)');
select is((select current_streak from betting_leaderboard where discord_id=(select u from cold)), 0::bigint, 'a lone loss reads current_streak=0 (no badge)');

-- ==== ranking: order by balance vs order by profit differ =====================

create temp table rich as select test_profile(9000) as u;
create temp table profitable as select test_profile(100) as u;
create temp table m9 as select test_market((select event_id from fx1), (select team_a from fx1), (select team_b from fx1)) as m;
select test_settled_bet((select u from profitable), (select m from m9), (select team_a from fx1), 100, 5000);
select ok(
  (select balance from betting_leaderboard where discord_id=(select u from rich))
    > (select balance from betting_leaderboard where discord_id=(select u from profitable)),
  'balance ranking favors the richer wallet'
);
select ok(
  (select profit from betting_leaderboard where discord_id=(select u from profitable))
    > (select profit from betting_leaderboard where discord_id=(select u from rich)),
  'profit ranking favors the wallet with the bigger net win'
);

select * from finish();
rollback;
