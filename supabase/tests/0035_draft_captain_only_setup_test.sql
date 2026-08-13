begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(4);

create temporary table t as select tests.fixture() as d;

-- Fixture teams come with captain (top) + free agent (jungle). Return every
-- free agent to the pool: teams are then captain-only with 4 open roles.
update public.players
  set team_id = null, price = null, acquisition = null
  where draft_id = (select d from t) and acquisition = 'free_agency';

select tests.acting_as(tests.admin_id());
select lives_ok(
  format($$select public.start_draft('%s')$$, (select d from t)),
  'a draft with captain-only teams starts');

select is(
  (select status from public.drafts where id = (select d from t)),
  'live', 'the draft goes live');

select is(
  (select current_nominator_team_id from public.drafts where id = (select d from t)),
  (select id from public.teams where draft_id = (select d from t) and nomination_position = 1),
  'position 1 opens the nominations');

-- over-pre-filled teams (3 slots taken before start) are still rejected
create temporary table t2 as select tests.fixture() as d2;
update public.players p
  set team_id = (select id from public.teams
                 where draft_id = (select d2 from t2) and nomination_position = 1),
      price = 0, acquisition = 'free_agency'
  where p.draft_id = (select d2 from t2) and p.display_name = 'Mid1';

select throws_like(
  format($$select public.start_draft('%s')$$, (select d2 from t2)),
  '%at most one free agent%', 'a team with three pre-filled roles is rejected');

select * from finish();
rollback;
