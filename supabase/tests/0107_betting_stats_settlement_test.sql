-- Automatic betting settlement must use raw_stats evidence, preserve the
-- existing payout/cancellation paths, and be safe to retry beside lifecycle.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
\ir helpers/_fixtures.sql.inc
\ir helpers/_betting_fixtures.sql.inc

select plan(28);

select has_column('public', 'betting_markets', 'settlement_run_id', 'market stores settlement run id');
select has_column('public', 'betting_markets', 'settlement_evidence', 'market stores frozen settlement evidence');
select is(has_function_privilege('anon', 'public.settle_betting_market_from_stats(bigint,uuid,bigint,jsonb,uuid)', 'execute'), false, 'anon cannot execute stats settlement');
select is(has_function_privilege('authenticated', 'public.settle_betting_market_from_stats(bigint,uuid,bigint,jsonb,uuid)', 'execute'), false, 'authenticated cannot execute stats settlement');
select is(has_function_privilege('service_role', 'public.settle_betting_market_from_stats(bigint,uuid,bigint,jsonb,uuid)', 'execute'), true, 'service role can execute stats settlement');

insert into public.league_teams(id, name, abbreviation)
values
  ('20000000-0000-0000-0000-000000000101', 'Alpha', 'ALP'),
  ('20000000-0000-0000-0000-000000000102', 'Bravo', 'BRV');
insert into public.betting_teams(id, name, short_code)
overriding system value
values (9101, 'Alpha', 'ALP'), (9102, 'Bravo', 'BRV');
insert into public.betting_events(name, league, schedule_season)
values ('Premier S99', 'premier', 'S99')
returning id \gset event_
insert into public.fixtures(id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b)
values ('10000000-0000-0000-0000-000000000101', 'S99', 'week_1', 'Alpha', 'Bravo', now(), 3, 0, 0);
insert into public.match_reports(id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status, fixture_id)
values ('30000000-0000-0000-0000-000000000101', 'S99', 'Regular',
        '20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000102', 0, 0,
        'pending', '10000000-0000-0000-0000-000000000101');
insert into public.match_report_games(report_id, game_number, match_id)
values
  ('30000000-0000-0000-0000-000000000101', 1, 'NA1_SETTLE_1'),
  ('30000000-0000-0000-0000-000000000101', 2, 'NA1_SETTLE_2'),
  ('30000000-0000-0000-0000-000000000101', 3, 'NA1_SETTLE_3');
insert into public.raw_stats(match_id, summoner_name, team_name, win, season)
values
  ('NA1_SETTLE_1', 'alpha-1', 'Alpha', true,  'S99'), ('NA1_SETTLE_1', 'bravo-1', 'Bravo', false, 'S99'),
  ('NA1_SETTLE_2', 'alpha-2', 'Alpha', false, 'S99'), ('NA1_SETTLE_2', 'bravo-2', 'Bravo', true,  'S99'),
  ('NA1_SETTLE_3', 'alpha-3', 'Alpha', true,  'S99'), ('NA1_SETTLE_3', 'bravo-3', 'Bravo', false, 'S99');

create temp table settlement_users as
select test_profile(100) as winner, test_profile(100) as loser, test_profile(100) as card_user;
insert into public.betting_markets(event_id, team_a_id, team_b_id, status, game_at, lock_at, fixture_id)
values (:'event_id', 9101, 9102, 'OPEN', now() + interval '1 hour', now() + interval '1 hour',
        '10000000-0000-0000-0000-000000000101')
returning id \gset market_
select place_bet((select winner from settlement_users), :'market_id', 9101, 10);
select place_bet((select loser from settlement_users), :'market_id', 9102, 20);
update public.betting_markets set status = 'LOCKED' where id = :'market_id';

select public.settle_betting_market_from_stats(
  :'market_id', '10000000-0000-0000-0000-000000000101', 9101,
  jsonb_build_object(
    'validation_status', 'ready',
    'fixture_id', '10000000-0000-0000-0000-000000000101',
    'season', 'S99',
    'source_report_ids', jsonb_build_array('30000000-0000-0000-0000-000000000101'),
    'source_match_ids', jsonb_build_array('NA1_SETTLE_1', 'NA1_SETTLE_2', 'NA1_SETTLE_3'),
    'series_score', jsonb_build_object('fixture_team_a', 2, 'fixture_team_b', 1),
    'winner_betting_team_id', 9101,
    'winner_team_name', 'Alpha'
  ),
  '40000000-0000-0000-0000-000000000101'
) as result \gset first_
select is(:'first_result'::jsonb->>'status', 'settled', 'verified series settles the market');
select is((select status from public.betting_markets where id=:'market_id'), 'RESOLVED', 'market is resolved');
select is((select winning_team_id from public.betting_markets where id=:'market_id'), 9101::bigint, 'raw stats winner is stored');
select is((select settlement_evidence #>> '{series_score,fixture_team_a}' from public.betting_markets where id=:'market_id'), '2', 'computed series score is stored');
select is((select settlement_run_id from public.betting_markets where id=:'market_id'), '40000000-0000-0000-0000-000000000101'::uuid, 'automation run id is stored');
select is((select balance from public.betting_profiles where discord_id=(select winner from settlement_users)), 120::bigint, 'existing market payout logic pays winner');
select is((select balance from public.betting_profiles where discord_id=(select loser from settlement_users)), 80::bigint, 'loser keeps the existing loss behavior');
select is((select payout from public.betting_bets where market_id=:'market_id' and team_id=9101), 30::bigint, 'winner payout is calculated by _resolve_market');
select is((select settled from public.betting_bets where market_id=:'market_id' and team_id=9102), true, 'loser bet is settled');
select is((select count(*) from public.betting_profiles p where p.discord_id in (select winner from settlement_users union all select loser from settlement_users) and p.balance <> coalesce((select sum(delta) from public.betting_ledger l where l.discord_id=p.discord_id),0)), 0::bigint, 'wallet balances equal their ledgers');
select is((select count(*) from public.betting_admin_audit where action='market_auto_resolve_stats' and target='betting_markets:'||:'market_id'), 1::bigint, 'automatic settlement uses the existing audit mechanism');

select public.settle_betting_market_from_stats(
  :'market_id', '10000000-0000-0000-0000-000000000101', 9101,
  (select settlement_evidence from public.betting_markets where id=:'market_id'),
  '40000000-0000-0000-0000-000000000102'
) as result \gset retry_
select is(:'retry_result'::jsonb->>'status', 'already_resolved', 'retry is idempotent');
select is((select balance from public.betting_profiles where discord_id=(select winner from settlement_users)), 120::bigint, 'retry does not pay twice');

update public.raw_stats set win = false where match_id='NA1_SETTLE_1' and team_name='Alpha';
select public.settle_betting_market_from_stats(
  :'market_id', '10000000-0000-0000-0000-000000000101', null,
  jsonb_build_object('validation_status','conflict','reason','later raw stats disagree'),
  '40000000-0000-0000-0000-000000000103'
) as result \gset conflict_
select is(:'conflict_result'::jsonb->>'status', 'conflict', 'later conflicting stats are flagged');
select is((select status from public.betting_markets where id=:'market_id'), 'RESOLVED', 'conflicting stats never reverse payout');
select is((select count(*) from public.betting_admin_audit where action='market_stats_conflict' and target='betting_markets:'||:'market_id'), 1::bigint, 'conflict is audited for review');

insert into public.betting_markets(event_id, team_a_id, team_b_id, status, game_at, lock_at)
values (:'event_id', 9101, 9102, 'OPEN', now() + interval '1 hour', now() + interval '1 hour')
returning id \gset cancelled_market_
insert into public.betting_pickems(event_id, title, status, lock_at)
values (:'event_id', 'Week 1', 'OPEN', now() + interval '1 hour')
returning id \gset pickem_
insert into public.betting_pickem_legs(pickem_id, market_id)
values (:'pickem_id', :'market_id'), (:'pickem_id', :'cancelled_market_id');
select place_pickem_card(
  (select card_user from settlement_users), :'pickem_id',
  jsonb_build_object(:'market_id'::text, '9101', :'cancelled_market_id'::text, '9101'), 10
);
select throws_like(format('select resolve_pickem(%s)', :'pickem_id'), '%unresolved series%', 'unresolved pickem leg stays pending');
select cancel_market_admin((select winner from settlement_users), :'cancelled_market_id');
select is((select status from public.betting_markets where id=:'cancelled_market_id'), 'CANCELLED', 'cancelled leg stays cancelled');
select resolve_pickem(:'pickem_id');
select is((select status from public.betting_pickems where id=:'pickem_id'), 'RESOLVED', 'final resolved leg resolves pickem');
select is((select correct from public.betting_pickem_cards where pickem_id=:'pickem_id'), 1, 'cancelled leg is excluded from grading');
select is((select settled from public.betting_pickem_cards where pickem_id=:'pickem_id'), true, 'pickem card is settled');
select is((select payout from public.betting_pickem_cards where pickem_id=:'pickem_id'), 10::bigint, 'existing pickem payout logic is preserved');
select is((select balance from public.betting_profiles where discord_id=(select card_user from settlement_users)), 100::bigint, 'pickem payout keeps the wallet ledger consistent');

select * from finish();
rollback;
