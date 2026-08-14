begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

select ok(not has_function_privilege('anon', 'public.nemesis_undo(uuid)', 'execute'),
          'anon cannot undo a nemesis pick');
select ok(not has_function_privilege('anon', 'public.nemesis_reset(uuid)', 'execute'),
          'anon cannot reset the nemesis draft');

create temporary table t as select tests.fixture() as d;
update public.drafts set status = 'complete' where id = (select d from t);
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 3) as c;

select tests.acting_as(tests.admin_id());
select public.nemesis_start((select d from t), (select a from ids), 'Lunari');
select public.nemesis_pick((select d from t), (select b from ids));
select public.nemesis_pick((select d from t), (select c from ids));

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_undo((select d from t)) $$,
  'NOT_ADMIN%', 'a captain cannot undo a pick');
select throws_like($$ select public.nemesis_reset((select d from t)) $$,
  'NOT_ADMIN%', 'a captain cannot reset the nemesis draft');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.nemesis_undo((select d from t)) $$,
  'admin undoes the last pick');
select is((select division from public.teams where id = (select c from ids)), null,
          'the undone team loses its division');
select is((select max(pick_number) from public.nemesis_picks where draft_id = (select d from t)), 1,
          'the chain rewinds to the previous pick');

-- Team B is on the clock again and the chain carries on.
select tests.acting_as(tests.cap(2));
select lives_ok($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'the rewound clock lets the previous chooser pick again');

select tests.acting_as(tests.admin_id());
select public.nemesis_undo((select d from t));
select public.nemesis_undo((select d from t));
select throws_like($$ select public.nemesis_undo((select d from t)) $$,
  'NEMESIS_SEED%', 'undo refuses to unwind the seed');

select lives_ok($$ select public.nemesis_reset((select d from t)) $$,
  'admin resets the nemesis draft');
select ok(
  not exists (select 1 from public.nemesis_picks where draft_id = (select d from t))
  and not exists (select 1 from public.teams
                    where draft_id = (select d from t) and division is not null),
  'reset clears every pick and every division');

select * from finish();
rollback;
