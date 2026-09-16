begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(5);

create temporary table t as select tests.fixture() as d;
create temporary table a as
with ins as (insert into public.drafts (name) values ('Academy Reuse Test') returning id)
select id as adraft from ins;

-- Premier retired a team in an earlier season: the test-owned row
-- survives in league_teams, deactivated, under its old abbreviation.
insert into public.league_teams (name, abbreviation, active)
values ('Test Academy Retired 0049', 'A', false);

-- The Academy draft now fields a team with that same name.
insert into public.teams (draft_id, name, abbreviation, nomination_position, budget_start, points_remaining)
values ((select adraft from a), 'Test Academy Retired 0049', 'AST', 1, 100, 100),
       ((select adraft from a), 'Test Academy New 0049', 'BNT', 2, 100, 100);

update public.league_settings set academy_draft_id = (select adraft from a) where id = 1;

select is((select active from public.league_teams where name = 'Test Academy Retired 0049'), false,
          'the reused name starts out retired');

select lives_ok($$ select public._sync_academy_teams_from_draft() $$, 'the sync runs');

-- The regression: without the reactivation pass this stayed false, and the
-- team vanished from /captain's report form.
select is((select active from public.league_teams where name = 'Test Academy Retired 0049'), true,
          'a reused Premier name is brought back into service');

select is((select count(*) from public.league_teams where name = 'Test Academy New 0049'), 1::bigint,
          'genuinely new Academy teams are still inserted');

select is((select active from public.league_teams where name = 'Test Academy New 0049'), true,
          'and are active');

select * from finish();
rollback;
