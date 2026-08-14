begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

select ok(not has_function_privilege('anon', 'public.nemesis_pick(uuid,uuid)', 'execute'),
          'anon cannot pick');

create temporary table t as select tests.fixture() as d;
update public.drafts set status = 'complete' where id = (select d from t);
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 3) as c,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 4) as dd;

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_pick((select d from t), (select b from ids)) $$,
  'NEMESIS_NOT_STARTED%', 'no picks before the draft is seeded');

select tests.acting_as(tests.admin_id());
select public.nemesis_start((select d from t), (select a from ids), 'Lunari');

-- Team A (cap 1) is on the clock; cap 2 is not.
select tests.acting_as(tests.cap(2));
select throws_like($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'NOT_YOUR_TURN%', 'only the team on the clock may pick');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_pick((select d from t), (select a from ids)) $$,
  'TEAM_PLACED%', 'an already-placed team cannot be picked again');

select lives_ok($$ select public.nemesis_pick((select d from t), (select b from ids)) $$,
  'the team on the clock banishes another team');
select is((select division from public.teams where id = (select b from ids)), 'Solari',
          'the chosen team lands opposite its chooser');

-- Team B is now on the clock; an admin may pick on their behalf.
select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.nemesis_pick((select d from t), (select c from ids)) $$,
  'an admin picks for the team on the clock');
select is((select division from public.teams where id = (select c from ids)), 'Lunari',
          'the third pick alternates back');

select tests.acting_as(tests.cap(3));
select lives_ok($$ select public.nemesis_pick((select d from t), (select dd from ids)) $$,
  'team c picks team d');

select is(
  (select string_agg(t2.name, ',' order by np.pick_number)
     from public.nemesis_picks np
     join public.teams t2 on t2.id = np.chosen_team_id
    where np.draft_id = (select d from t) and np.division = 'Lunari'),
  'Team A,Team C',
  'Lunari holds the odd picks');
select is(
  (select string_agg(t2.name, ',' order by np.pick_number)
     from public.nemesis_picks np
     join public.teams t2 on t2.id = np.chosen_team_id
    where np.draft_id = (select d from t) and np.division = 'Solari'),
  'Team B,Team D',
  'Solari holds the even picks');

select tests.acting_as(tests.cap(4));
select throws_like($$ select public.nemesis_pick((select d from t), (select a from ids)) $$,
  'NEMESIS_COMPLETE%', 'no picks once every team is placed');

select * from finish();
rollback;
