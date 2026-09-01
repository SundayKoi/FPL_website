-- Forfeits on match_reports: the declared side must be one of the two teams
-- actually in the series, 'forfeit' joins the status vocabulary, and a
-- forfeit report is still an ordinary report in every other respect —
-- including that the games which WERE played stay attached to it.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

insert into public.league_teams (id, name, abbreviation) values
  ('70000000-0000-0000-0000-000000000001', 'Forfeit Home', 'FFH'),
  ('70000000-0000-0000-0000-000000000002', 'Forfeit Away', 'FFA'),
  ('70000000-0000-0000-0000-000000000003', 'Uninvolved Third', 'UT3');

-- ==== the column exists, nullable, and defaults to "not a forfeit" =========

select col_is_null('public', 'match_reports', 'forfeit_team_id',
  'forfeit_team_id is nullable — the overwhelming majority of series are not forfeits');

insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b)
values ('70000000-0000-0000-0000-0000000000a1', 'S4', 'regular',
        '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 2, 1);
select is(
  (select forfeit_team_id from public.match_reports where id = '70000000-0000-0000-0000-0000000000a1'),
  null::uuid, 'an ordinary report carries no forfeit');

-- ==== the forfeiting side must be IN the series ============================

insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, forfeit_team_id, forfeit_note)
values ('70000000-0000-0000-0000-0000000000a2', 'S4', 'regular',
        '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 2, 0,
        '70000000-0000-0000-0000-000000000002', 'no show');
select is(
  (select forfeit_note from public.match_reports where id = '70000000-0000-0000-0000-0000000000a2'),
  'no show', 'a forfeit by team_b is accepted, note and all');

select is(
  (select forfeit_team_id from public.match_reports where id = '70000000-0000-0000-0000-0000000000a2'),
  '70000000-0000-0000-0000-000000000002'::uuid, 'the declared side is stored as given');

select throws_ok(
  $$insert into public.match_reports (season, season_phase, team_a_id, team_b_id, forfeit_team_id)
    values ('S4', 'regular',
            '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002',
            '70000000-0000-0000-0000-000000000003')$$,
  '23514',
  null,
  'a team that did not play the series cannot be the one that forfeited it');

-- ==== 'forfeit' is a status, and the old vocabulary survived the swap ======

insert into public.match_reports (id, season, season_phase, team_a_id, team_b_id, score_a, score_b, forfeit_team_id, status)
values ('70000000-0000-0000-0000-0000000000a3', 'S4', 'regular',
        '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', 2, 0,
        '70000000-0000-0000-0000-000000000002', 'forfeit');
select is(
  (select status from public.match_reports where id = '70000000-0000-0000-0000-0000000000a3'),
  'forfeit', 'a series with nothing played lands on the new status');

select lives_ok(
  $$update public.match_reports set status = 'needs_sides'
     where id = '70000000-0000-0000-0000-0000000000a3'$$,
  'replacing the status constraint kept every value the ingest already writes');

select throws_ok(
  $$update public.match_reports set status = 'conceded'
     where id = '70000000-0000-0000-0000-0000000000a3'$$,
  '23514',
  null,
  'and it still refuses a status nothing writes');

-- ==== the games that WERE played stay attached ==============================
-- This is the whole point of reporting a forfeit rather than skipping the
-- series: game one really happened, and its stats belong to the players.

insert into public.match_report_games (report_id, game_number, match_id, blue_team_id)
values ('70000000-0000-0000-0000-0000000000a2', 1, 'NA1_5550000001',
        '70000000-0000-0000-0000-000000000001');
select is(
  (select count(*) from public.match_report_games
    where report_id = '70000000-0000-0000-0000-0000000000a2'),
  1::bigint, 'a forfeit report still carries the games that were actually played');

select * from finish();
rollback;
