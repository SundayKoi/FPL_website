begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(3);

create temporary table t as select tests.fixture() as d;
update public.drafts set status = 'complete' where id = (select d from t);
create temporary table ids as
  select (select id from public.teams
           where draft_id = (select d from t) and nomination_position = 1) as team_a;

select tests.acting_as(tests.admin_id());

-- Marked as the Academy draft, it must refuse.
update public.league_settings set academy_draft_id = (select d from t) where id = 1;
select throws_like($$ select public.nemesis_start(
  (select d from t), (select team_a from ids), 'Lunari') $$,
  'NEMESIS_INVALID%', 'the Academy draft cannot start a nemesis draft');
select is((select count(*) from public.nemesis_picks where draft_id = (select d from t)), 0::bigint,
          'nothing is written by the refused start');

-- The same draft works once it is not the Academy one, so the guard is what
-- blocked it rather than some other precondition.
update public.league_settings set academy_draft_id = null where id = 1;
select lives_ok($$ select public.nemesis_start(
  (select d from t), (select team_a from ids), 'Lunari') $$,
  'a premier draft still starts normally');

select * from finish();
rollback;
