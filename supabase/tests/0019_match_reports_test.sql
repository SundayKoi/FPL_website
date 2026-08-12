-- ---------------------------------------------------------------------------
-- Match-reporting Task 2: match report queue tables (match_reports,
-- match_report_games) + the is_captain() helper + their RLS. See
-- docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md
-- ("Data model" section) and .superpowers/sdd/2026-08-11-match-reporting-
-- auto-ingest/task-2-brief.md, including the MERGE AMENDMENT: match_reports
-- gets a nullable, non-unique fixture_id -> public.fixtures(id) on delete
-- set null (reports are standalone; the link is optional -- see
-- overlap-analysis.md section 3).
--
-- NOTE: 0019_league_settings_season_test.sql (a co-developer's file) already
-- claims the 0019 numeric prefix. This is a separate file under the same
-- prefix -- both are picked up by `supabase test db`'s recursive glob.
-- ---------------------------------------------------------------------------
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(16);

-- tests.fixture() builds a draft with 4 teams whose captains are
-- tests.cap(1..4) at the DRAFT level (teams.captain_profile_id) -- this used
-- to be exactly what is_captain() checked, but match_reports/
-- match_report_games write RLS is now season-scoped to league_team_captains
-- via is_captain_of() instead (see 20260811100004_report_rls_season_captains.sql).
-- Draft captaincy alone is kept here on purpose: tests.cap(3) (Team C's
-- draft captain, given NO league_team_captains row below) is exactly what
-- proves draft captaincy alone is no longer sufficient.
select tests.fixture();

-- raw_stats is empty inside the test transaction, so league_teams rows must
-- be inserted directly here rather than via sync_league_teams_from_stats().
-- Names/abbreviations are deliberately synthetic (cf. 0018_league_config_test.sql's
-- "Zulu Zone"/"Zany Zebras") so they cannot collide with real committed teams.
insert into public.league_teams (id, name, abbreviation) values
  ('10000000-0000-0000-0000-000000000001', 'Zeta Test Alpha', 'ZTA'),
  ('10000000-0000-0000-0000-000000000002', 'Zeta Test Beta', 'ZTB'),
  ('10000000-0000-0000-0000-000000000003', 'Zeta Test Gamma', 'ZTG');

-- Season-scoped captaincy (league_team_captains) -- the model report writes
-- are gated on as of the fix-round migration: tests.cap(1) captains Zeta
-- Test Alpha (team_a_id of the report below) for season 'S5'; tests.cap(2)
-- captains Zeta Test Gamma, a team wholly unrelated to that report, same
-- season -- used below to prove captaining *some* team isn't enough on its
-- own.
insert into public.league_team_captains (league_team_id, season, profile_id) values
  ('10000000-0000-0000-0000-000000000001', 'S5', tests.cap(1)),
  ('10000000-0000-0000-0000-000000000003', 'S5', tests.cap(2));

-- === tables + helper exist ===================================================
select has_table('public', 'match_reports', 'match_reports exists');
select has_table('public', 'match_report_games', 'match_report_games exists');
select has_function('public', 'is_captain', 'is_captain function exists');

-- === anon: public read, no write =============================================
select ok(has_table_privilege('anon', 'public.match_reports', 'select'), 'anon reads match_reports');
select ok(has_table_privilege('anon', 'public.match_report_games', 'select'), 'anon reads match_report_games');
select ok(not has_table_privilege('anon', 'public.match_reports', 'insert'), 'anon cannot insert match_reports');

-- === season-scoped captain of team A: can insert a report and its games =====
select tests.acting_as(tests.cap(1));
set local role authenticated;
select lives_ok($$
  insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b)
  values ('20000000-0000-0000-0000-000000000001', 'S5', 'Regular',
          '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 3, 0)
$$, 'season-scoped captain of team A can insert a match report for A-vs-B');
select lives_ok($$
  insert into public.match_report_games (report_id, game_number, match_id)
  values ('20000000-0000-0000-0000-000000000001', 1, 'NA1_5568297187')
$$, 'season-scoped captain of team A can insert a match report game');
reset role;

-- === season-scoped captain of an UNRELATED team: cannot insert ==============
-- tests.cap(2) captains Zeta Test Gamma -- neither team_a_id nor team_b_id
-- of the report above -- so is_captain_of() is false for both and this must
-- be denied even though cap(2) legitimately captains some team this season.
select tests.acting_as(tests.cap(2));
set local role authenticated;
select throws_ok($$
  insert into public.match_reports (season, season_phase, team_a_id, team_b_id)
  values ('S5', 'Regular', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')
$$, '42501', null, 'captain of an unrelated team cannot insert a match report for A-vs-B');
reset role;

-- === draft-only captain (teams.captain_profile_id, no league_team_captains row): cannot insert ===
-- tests.cap(3) is Team C's DRAFT captain (tests.fixture() sets
-- teams.captain_profile_id = tests.cap(3)), which used to satisfy the old
-- is_captain() check on its own -- but has no league_team_captains row at
-- all, proving draft captaincy alone no longer grants report-write access.
select tests.acting_as(tests.cap(3));
set local role authenticated;
select throws_ok($$
  insert into public.match_reports (season, season_phase, team_a_id, team_b_id)
  values ('S5', 'Regular', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')
$$, '42501', null, 'draft-only captain (no league_team_captains row) cannot insert a match report');
reset role;

-- === non-captain, non-admin: cannot insert ====================================
insert into public.profiles (id, display_name) values (tests.cap(9), 'Bystander')
  on conflict (id) do nothing;
select tests.acting_as(tests.cap(9));
set local role authenticated;
select throws_ok($$
  insert into public.match_reports (season, season_phase, team_a_id, team_b_id)
  values ('S5', 'Regular', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')
$$, '42501', null, 'non-captain non-admin cannot insert a match report');
reset role;

-- === constraints (default role bypasses RLS, isolating the constraint) =======
prepare dup_match_id as
  insert into public.match_report_games (report_id, game_number, match_id)
  values ('20000000-0000-0000-0000-000000000001', 2, 'NA1_5568297187');
select throws_ok('dup_match_id', 23505, null, 'match_id unique index rejects a duplicate');

prepare bad_status as
  insert into public.match_reports (season, season_phase, team_a_id, team_b_id, status)
  values ('S5', 'Regular', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'bogus');
select throws_ok('bad_status', 23514, null, 'bad status value rejected by check constraint');

prepare same_team as
  insert into public.match_reports (season, season_phase, team_a_id, team_b_id)
  values ('S5', 'Regular', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
select throws_ok('same_team', 23514, null, 'team_a_id = team_b_id rejected');

-- === MERGE AMENDMENT: optional, standalone fixture_id link ====================
select has_column('public', 'match_reports', 'fixture_id', 'match_reports has fixture_id');

insert into public.fixtures (id, stage, best_of) values
  ('30000000-0000-0000-0000-000000000001', 'week_1', 3);
update public.match_reports set fixture_id = '30000000-0000-0000-0000-000000000001'
  where id = '20000000-0000-0000-0000-000000000001';
delete from public.fixtures where id = '30000000-0000-0000-0000-000000000001';
select ok(
  exists(
    select 1 from public.match_reports
    where id = '20000000-0000-0000-0000-000000000001' and fixture_id is null
  ),
  'deleting a linked fixtures row sets fixture_id null rather than deleting the report'
);

select * from finish();
rollback;
