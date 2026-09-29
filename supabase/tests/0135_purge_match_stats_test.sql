-- A wrongly reported series can be reported again. purge_match_stats drops
-- the raw_stats rows behind the named Riot games and returns any report that
-- still lists them to the ingest queue. Admin-only, and it touches nothing it
-- was not handed: sibling games, unrelated reports, and games that never
-- ingested all come through exactly as they were.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(20);

insert into public.profiles (id, display_name, is_admin) values
  (tests.admin_id(), 'Purge Admin', true),
  (tests.cap(1), 'Purge Captain', false)
on conflict (id) do nothing;

insert into public.league_teams (id, name, abbreviation) values
  ('72000000-0000-0000-0000-000000000001', 'Purge Home', 'PGH'),
  ('72000000-0000-0000-0000-000000000002', 'Purge Away', 'PGA');

-- R1: the series that was reported wrong — fully ingested and score-checked.
insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status, warning_text, ingested_at)
values ('72000000-0000-0000-0000-0000000000a1', 'ZZ', 'Playoffs',
        '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 2, 0,
        'ingested', 'Reported 2-0 but games show 1-1', now());
insert into public.match_report_games (id, report_id, game_number, match_id, blue_team_id, resolved_blue_team_id, status) values
  ('72000000-0000-0000-0000-0000000000b1', '72000000-0000-0000-0000-0000000000a1', 1, 'NA1_7200000000000000001',
   '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'ingested'),
  ('72000000-0000-0000-0000-0000000000b2', '72000000-0000-0000-0000-0000000000a1', 2, 'NA1_7200000000000000002',
   '72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000002', 'ingested');

-- R2: an unrelated ingested series that must come through untouched.
insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status, ingested_at)
values ('72000000-0000-0000-0000-0000000000a2', 'ZZ', 'Regular',
        '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 1, 0,
        'ingested', now());
insert into public.match_report_games (id, report_id, game_number, match_id, blue_team_id, resolved_blue_team_id, status) values
  ('72000000-0000-0000-0000-0000000000b3', '72000000-0000-0000-0000-0000000000a2', 1, 'NA1_7200000000000000003',
   '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000001', 'ingested');

-- R3: a report whose one game never ingested.
insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status, error_text)
values ('72000000-0000-0000-0000-0000000000a3', 'ZZ', 'Regular',
        '72000000-0000-0000-0000-000000000001', '72000000-0000-0000-0000-000000000002', 1, 0,
        'failed', 'Could not fetch match NA1_7200000000000000004 from the Riot API.');
insert into public.match_report_games (id, report_id, game_number, match_id, blue_team_id, status, error_text) values
  ('72000000-0000-0000-0000-0000000000b4', '72000000-0000-0000-0000-0000000000a3', 1, 'NA1_7200000000000000004',
   '72000000-0000-0000-0000-000000000001', 'failed', 'Could not fetch match NA1_7200000000000000004 from the Riot API.');

-- Two players per ingested game, plus a game whose report was already
-- deleted: the orphan the reporting form used to be stuck on.
insert into public.raw_stats (match_id, summoner_name, team_name, season, season_phase) values
  ('NA1_7200000000000000001', 'Purge One', 'Purge Home', 'ZZ', 'Playoffs'),
  ('NA1_7200000000000000001', 'Purge Two', 'Purge Away', 'ZZ', 'Playoffs'),
  ('NA1_7200000000000000002', 'Purge One', 'Purge Away', 'ZZ', 'Playoffs'),
  ('NA1_7200000000000000002', 'Purge Two', 'Purge Home', 'ZZ', 'Playoffs'),
  ('NA1_7200000000000000003', 'Purge One', 'Purge Home', 'ZZ', 'Regular'),
  ('NA1_7200000000000000003', 'Purge Two', 'Purge Away', 'ZZ', 'Regular'),
  ('NA1_7200000000000000009', 'Purge One', 'Purge Away', 'ZZ', 'Playoffs'),
  ('NA1_7200000000000000009', 'Purge Two', 'Purge Home', 'ZZ', 'Playoffs');

-- ==== who may call it ========================================================

select ok(not has_function_privilege('anon', 'public.purge_match_stats(text[])', 'execute'),
  'anon cannot call purge_match_stats');
select ok(has_function_privilege('authenticated', 'public.purge_match_stats(text[])', 'execute'),
  'signed-in callers reach the function; the admin check inside decides');

select tests.acting_as(tests.cap(1));
set local role authenticated;
select throws_like(
  $$select public.purge_match_stats(array['NA1_7200000000000000001'])$$,
  '%NOT_ADMIN%',
  'a captain cannot purge stats');
reset role;
select is(
  (select count(*) from public.raw_stats where match_id = 'NA1_7200000000000000001'),
  2::bigint, 'and the refused call deleted nothing');

-- ==== an empty request is a mistake, not a no-op ============================

select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like(
  $$select public.purge_match_stats(array[]::text[])$$,
  '%MATCH_IDS_REQUIRED%',
  'an empty list is refused rather than silently doing nothing');
select throws_like(
  $$select public.purge_match_stats(array['  ', ''])$$,
  '%MATCH_IDS_REQUIRED%',
  'so is a list of blanks');
select throws_like(
  $$select public.purge_match_stats(null)$$,
  '%MATCH_IDS_REQUIRED%',
  'and null');

-- ==== the purge ==============================================================
-- Game one of R1, the orphan, and R3's never-ingested game. Whitespace and a
-- repeat of the same id are the kind of thing a pasted list carries.

select is(
  public.purge_match_stats(array[
    ' NA1_7200000000000000001 ', 'NA1_7200000000000000001',
    'NA1_7200000000000000009',
    'NA1_7200000000000000004'
  ]),
  jsonb_build_object('stats_deleted', 4, 'games_reset', 1, 'reports_reset', 1),
  'reports what it did: two players for the named game and two for the orphan, one game and one report back to pending, repeats counted once');
reset role;

select is(
  (select count(*) from public.raw_stats where match_id = 'NA1_7200000000000000001'),
  0::bigint, 'the named game''s rows are gone');
select is(
  (select count(*) from public.raw_stats where match_id = 'NA1_7200000000000000009'),
  0::bigint, 'so are the rows of a game whose report was already deleted');
select is(
  (select count(*) from public.raw_stats where match_id = 'NA1_7200000000000000002'),
  2::bigint, 'game two of the same report was not named, so its rows stay');
select is(
  (select count(*) from public.raw_stats where match_id = 'NA1_7200000000000000003'),
  2::bigint, 'an unrelated report''s rows stay');

select is(
  (select status || ':' || coalesce(resolved_blue_team_id::text, 'null')
     from public.match_report_games where id = '72000000-0000-0000-0000-0000000000b1'),
  'pending:null', 'the named game goes back to pending with its resolved side cleared');
select is(
  (select status from public.match_report_games where id = '72000000-0000-0000-0000-0000000000b2'),
  'ingested', 'its sibling keeps its ingested status — its rows are still there');
select is(
  (select status || ':' || coalesce(warning_text, 'null') || ':' || coalesce(ingested_at::text, 'null')
     from public.match_reports where id = '72000000-0000-0000-0000-0000000000a1'),
  'pending:null:null', 'the report returns to the queue with its stale score warning cleared');
select is(
  (select status from public.match_reports where id = '72000000-0000-0000-0000-0000000000a2'),
  'ingested', 'the unrelated report is untouched');
select is(
  (select status || ':' || coalesce(error_text, '')
     from public.match_report_games where id = '72000000-0000-0000-0000-0000000000b4'),
  'failed:Could not fetch match NA1_7200000000000000004 from the Riot API.',
  'a game that never ingested is left as it was, error and all');
select is(
  (select status from public.match_reports where id = '72000000-0000-0000-0000-0000000000a3'),
  'failed', 'and so is its report');

-- ==== running it twice =======================================================

select tests.acting_as(tests.admin_id());
set local role authenticated;
select is(
  public.purge_match_stats(array['NA1_7200000000000000001']),
  jsonb_build_object('stats_deleted', 0, 'games_reset', 0, 'reports_reset', 0),
  'running it again finds nothing left to do');
reset role;

-- ==== the case it exists for =================================================
-- The wrong report is deleted, its stats are purged, and the same Riot game
-- can be filed again under a corrected report.

delete from public.match_reports where id = '72000000-0000-0000-0000-0000000000a1';
select lives_ok($$
  insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b)
  values ('72000000-0000-0000-0000-0000000000a9', 'ZZ', 'Playoffs',
          '72000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 2, 0);
  insert into public.match_report_games (report_id, game_number, match_id, blue_team_id)
  values ('72000000-0000-0000-0000-0000000000a9', 1, 'NA1_7200000000000000001',
          '72000000-0000-0000-0000-000000000002');
$$, 'once the stats are purged and the old report deleted, the game can be reported again');

select * from finish();
rollback;
