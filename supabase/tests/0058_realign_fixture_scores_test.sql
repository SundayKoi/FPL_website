begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

insert into public.league_teams (name, abbreviation) values
  ('Freaks Under Restraint', 'FUR9'), ('The Original Mocha House', 'TOM9')
on conflict (name) do nothing;

create temporary table ids as
select
  (select id from public.league_teams where name = 'Freaks Under Restraint') as fur,
  (select id from public.league_teams where name = 'The Original Mocha House') as tom;

-- The fixture lists the teams in the opposite order to the report, which is
-- exactly the case that used to be written reversed.
insert into public.fixtures (id, season, stage, team_a, team_b, best_of, sort_order, score_a, score_b)
values ('70000000-0000-0000-0000-000000000001', 'S5', 'week_1',
        'The Original Mocha House', 'Freaks Under Restraint', 3, 1, 2, 1);

-- A second fixture already in the same order as its report: must not move.
insert into public.fixtures (id, season, stage, team_a, team_b, best_of, sort_order, score_a, score_b)
values ('70000000-0000-0000-0000-000000000002', 'S5', 'week_1',
        'Freaks Under Restraint', 'The Original Mocha House', 3, 2, 2, 1);

insert into public.match_reports (fixture_id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status)
select '70000000-0000-0000-0000-000000000001', 'S5', 'Regular', fur, tom, 2, 1, 'ingested' from ids;
insert into public.match_reports (fixture_id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status)
select '70000000-0000-0000-0000-000000000002', 'S5', 'Regular', fur, tom, 2, 1, 'ingested' from ids;

select is(public.realign_fixture_scores_to_reports(), 1, 'only the reversed fixture is corrected');

select is((select score_a from public.fixtures where id = '70000000-0000-0000-0000-000000000001'), 1,
          'the reversed fixture now gives Mocha House 1');
select is((select score_b from public.fixtures where id = '70000000-0000-0000-0000-000000000001'), 2,
          'and Freaks Under Restraint the series win');

select is((select score_a from public.fixtures where id = '70000000-0000-0000-0000-000000000002'), 2,
          'a correctly-ordered fixture is left alone');

-- Re-running must not swap the row back.
select is((select public.realign_fixture_scores_to_reports()), 0, 'a second run changes nothing');

select * from finish();
rollback;
