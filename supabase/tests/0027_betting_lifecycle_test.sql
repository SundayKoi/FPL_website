-- Announcements queue, betting_lifecycle_tick, pg_cron. Ported assertions
-- from c:\fpl_gambling\tests\{test_bot_service,test_seasons}.py, restructured
-- for pgTAP: local factory functions replace the Python fixtures/conftest
-- factories (both are transactional and rolled back with the test).
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

select plan(39);

create temp table fx as
with e as (insert into betting_events(name) values ('Fixture Event') returning id),
     ta as (insert into betting_teams(name, short_code) values ('Team A','TA') returning id),
     tb as (insert into betting_teams(name, short_code) values ('Team B','TB') returning id)
select e.id as event_id, ta.id as team_a, tb.id as team_b from e, ta, tb;

create temp table act as select test_profile(0) as actor;

-- ==== betting_lifecycle_tick: locks a market past lock_at ====================

-- two-sided (both teams backed) so void_one_sided_markets leaves it alone
-- and only lock_due_markets acts on it
create temp table s1 as select test_profile(1000) as a, test_profile(1000) as b;
create temp table s1m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select place_bet((select a from s1), (select m from s1m), (select team_a from fx), 100);
select place_bet((select b from s1), (select m from s1m), (select team_b from fx), 100);
update betting_markets set lock_at = now() - interval '30 seconds' where id = (select m from s1m);
select betting_lifecycle_tick();
select is((select status from betting_markets where id=(select m from s1m)), 'LOCKED', 'betting_lifecycle_tick locks a two-sided market past lock_at');

-- ==== betting_lifecycle_tick: voids a one-sided market with refunds ==========

create temp table s2 as select test_profile(1000) as u;
create temp table s2m as select test_market(
  (select event_id from fx), (select team_a from fx), (select team_b from fx),
  0, interval '-30 seconds', 'OPEN'
) as m;
insert into betting_bets(market_id, discord_id, team_id, amount) values ((select m from s2m), (select u from s2), (select team_a from fx), 500);
insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
  select (select u from s2), -500, 'bet_place', 'betting_bets', id from betting_bets where market_id=(select m from s2m);
update betting_profiles set balance = balance - 500 where discord_id=(select u from s2);
select betting_lifecycle_tick();
select is((select balance from betting_profiles where discord_id=(select u from s2)), 1000::bigint, 'betting_lifecycle_tick refunds a one-sided market''s bettor');
select is((select status from betting_markets where id=(select m from s2m)), 'CANCELLED', 'betting_lifecycle_tick voids a one-sided market');

-- ==== betting_lifecycle_tick: locks + resolves a ready pick'em ===============

create temp table night1 as select test_night(2) as e;
create temp table legs1 as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night1) order by m.id;
create temp table p1 as select create_pickem_admin(
  (select actor from act), (select e from night1), 'Night', (select array_agg(market_id order by market_id) from legs1)
) as pickem_id;
create temp table pu1 as select test_profile(1000) as u;
create temp table picks1 as select jsonb_object_agg(market_id::text, team_a_id) as picks from legs1;
select place_pickem_card((select u from pu1), (select pickem_id from p1), (select picks from picks1), 200);

update betting_pickems set lock_at = now() - interval '1 minute' where id=(select pickem_id from p1);
select is(array(select resolvable_pickems()), array[]::bigint[], 'resolvable_pickems is empty while legs are unresolved');
select resolve_market_admin((select actor from act), market_id, team_a_id) from legs1;
select is(array(select resolvable_pickems()), array[(select pickem_id from p1)], 'resolvable_pickems lists a pick''em whose every leg settled');

select betting_lifecycle_tick();
select is((select status from betting_pickems where id=(select pickem_id from p1)), 'RESOLVED', 'betting_lifecycle_tick resolves a ready pick''em');
select is((select balance from betting_profiles where discord_id=(select u from pu1)), 1000::bigint, 'betting_lifecycle_tick''s resolve pays out the perfect card (sole winner gets their stake back)');
select is(array(select resolvable_pickems()), array[]::bigint[], 'resolvable_pickems is empty again after resolution');

-- ==== unannounced_markets / mark_announced: appears once, dedupes ============

create temp table s3m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx)) as m;
select ok((select m from s3m) = any(array(select id from unannounced_markets('open'))), 'unannounced_markets(open) lists a fresh open market');
select mark_announced((select m from s3m), 'open');
select ok(not ((select m from s3m) = any(array(select id from unannounced_markets('open')))), 'mark_announced dedupes the open queue');

update betting_markets set status = 'RESOLVED', resolved_at = now() where id = (select m from s3m);
select ok((select m from s3m) = any(array(select id from unannounced_markets('resolved'))), 'unannounced_markets(resolved) lists a resolved market exactly once');
select mark_announced((select m from s3m), 'resolved');
select ok(not ((select m from s3m) = any(array(select id from unannounced_markets('resolved')))), 'mark_announced dedupes the resolved queue');

-- open queue skips markets already past lock_at
create temp table s4m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '-60 seconds', 'OPEN') as m;
select ok(not ((select m from s4m) = any(array(select id from unannounced_markets('open')))), 'unannounced_markets(open) skips markets already past lock_at');

-- ==== markets_locking_soon: dedupes through the lock_warn kind ===============

create temp table s5m as select test_market((select event_id from fx),(select team_a from fx),(select team_b from fx), 0, interval '3 minutes', 'OPEN') as m;
select ok((select m from s5m) = any(array(select id from markets_locking_soon())), 'markets_locking_soon lists a market locking within the default window');
select mark_announced((select m from s5m), 'lock_warn');
select ok(not ((select m from s5m) = any(array(select id from markets_locking_soon()))), 'markets_locking_soon dedupes via lock_warn');

-- ==== unannounced_pickems / mark_pickem_announced =============================

create temp table night2 as select test_night(2) as e;
create temp table legs2 as
  select m.id as market_id, m.team_a_id from betting_markets m where m.event_id=(select e from night2) order by m.id;
create temp table p2 as select create_pickem_admin(
  (select actor from act), (select e from night2), 'Night 2', (select array_agg(market_id order by market_id) from legs2)
) as pickem_id;
select ok((select pickem_id from p2) = any(array(select id from unannounced_pickems('open'))), 'unannounced_pickems(open) lists a fresh pick''em');
select mark_pickem_announced((select pickem_id from p2), 'open');
select ok(not ((select pickem_id from p2) = any(array(select id from unannounced_pickems('open')))), 'mark_pickem_announced dedupes the open queue');

select cancel_pickem_admin((select actor from act), (select pickem_id from p2));
select ok((select pickem_id from p2) = any(array(select id from unannounced_pickems('done'))), 'unannounced_pickems(done) lists the cancelled pick''em');
select is((select status from unannounced_pickems('done') where id = (select pickem_id from p2)), 'CANCELLED', 'unannounced_pickems(done) reports its status');
select mark_pickem_announced((select pickem_id from p2), 'done');
select ok(not ((select pickem_id from p2) = any(array(select id from unannounced_pickems('done')))), 'mark_pickem_announced dedupes the done queue');

-- ==== unannounced_closed_seasons / season_podium / mark_season_announced =====

create temp table rich as select test_profile(9000) as u;
create temp table mid as select test_profile(3000) as u;
update betting_profiles set username = 'Rich' where discord_id = (select u from rich);
update betting_profiles set username = 'Mid' where discord_id = (select u from mid);

-- clear every still-open market/pick'em out of the way (none from earlier
-- scenarios carry bets or cards) so close_season_admin isn't blocked
update betting_markets set status = 'CANCELLED' where status in ('OPEN', 'LOCKED');
update betting_pickems set status = 'CANCELLED' where status in ('OPEN', 'LOCKED');

create temp table season1 as select create_season_admin((select actor from act), 'Split 1') as id;
select close_season_admin((select actor from act), (select id from season1), 0, 10);
select ok((select id from season1) = any(array(select id from unannounced_closed_seasons())), 'unannounced_closed_seasons lists a freshly closed season');
select is((select username from season_podium((select id from season1)) order by rank limit 1), 'Rich', 'season_podium ranks the top wallet first');
select mark_season_announced((select id from season1));
select ok(not ((select id from season1) = any(array(select id from unannounced_closed_seasons()))), 'mark_season_announced dedupes the closed-season queue');

-- ==== ledger_drift: clean on healthy data, catches a bypassed write ==========

select is((select count(*) from ledger_drift()), 0::bigint, 'ledger_drift is empty on healthy data');
create temp table drifty as select test_profile(1000) as u;
update betting_profiles set balance = balance + 1 where discord_id = (select u from drifty);
select is((select count(*) from ledger_drift()), 1::bigint, 'ledger_drift catches a raw balance write');
select is((select balance from ledger_drift() where discord_id = (select u from drifty)), 1001::bigint, 'ledger_drift reports the drifted balance');
select is((select ledger_total from ledger_drift() where discord_id = (select u from drifty)), 1000::bigint, 'ledger_drift reports the true ledger total');

-- ==== pg_cron: the lifecycle tick is scheduled every minute ==================

select ok(exists(select 1 from cron.job where jobname = 'betting-lifecycle'), 'betting-lifecycle cron job is scheduled');
select is((select schedule from cron.job where jobname = 'betting-lifecycle'), '* * * * *', 'betting-lifecycle runs every minute');

-- ==== execute privilege lockdown: entire betting RPC surface is service_role-only

select is(has_function_privilege('anon', 'public.betting_lifecycle_tick()', 'execute'), false, 'anon cannot execute betting_lifecycle_tick');
select is(has_function_privilege('authenticated', 'public.betting_lifecycle_tick()', 'execute'), false, 'authenticated cannot execute betting_lifecycle_tick');
select is(has_function_privilege('service_role', 'public.betting_lifecycle_tick()', 'execute'), true, 'service_role can execute betting_lifecycle_tick');

select is(has_function_privilege('anon', 'public.ledger_drift()', 'execute'), false, 'anon cannot execute ledger_drift');
select is(has_function_privilege('service_role', 'public.ledger_drift()', 'execute'), true, 'service_role can execute ledger_drift');

select is(has_function_privilege('anon', 'public.unannounced_markets(text)', 'execute'), false, 'anon cannot execute unannounced_markets');
select is(has_function_privilege('service_role', 'public.unannounced_markets(text)', 'execute'), true, 'service_role can execute unannounced_markets');

select is(has_function_privilege('anon', 'public.mark_season_announced(bigint)', 'execute'), false, 'anon cannot execute mark_season_announced');
select is(has_function_privilege('service_role', 'public.mark_season_announced(bigint)', 'execute'), true, 'service_role can execute mark_season_announced');

-- ==== invariant: sum(ledger.delta) = balance for every wallet touched ===========
-- (excludes the deliberately drifted wallet from the ledger_drift scenario above)

select is(
  (select count(*) from betting_profiles p
     where p.discord_id <> (select u from drifty)
       and p.balance <> coalesce((select sum(delta) from betting_ledger l where l.discord_id = p.discord_id), 0)),
  0::bigint,
  'ledger invariant holds for every wallet touched other than the deliberately drifted one'
);

select * from finish();
rollback;
