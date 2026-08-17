begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

create temporary table t as select tests.fixture() as d;

-- A name the league used and retired an earlier season (the Wildcats case).
insert into public.league_teams (name, abbreviation, active)
values ('Wildcats', 'WC', false);

insert into public.teams (draft_id, name, abbreviation, nomination_position, budget_start, points_remaining)
values ((select d from t), 'Wildcats', 'WLD', 90, 100, 100);

update public.league_settings set featured_draft_id = (select d from t) where id = 1;

select is((select active from public.league_teams where name = 'Wildcats'), false,
          'the retired name starts out inactive');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.sync_league_teams_from_draft() $$, 'the sync runs for an admin');

-- The regression: previously skipped, leaving the captains unable to pick
-- their team in the report form.
select is((select active from public.league_teams where name = 'Wildcats'), true,
          'a redrafted retired name is brought back into service');

select is((select count(*) from public.league_teams where lower(name) = 'wildcats'), 1::bigint,
          'and is not duplicated');

select * from finish();
rollback;
