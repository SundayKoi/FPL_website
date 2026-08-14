begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(11);

select ok(not has_function_privilege('anon', 'public.nemesis_start(uuid,uuid,text)', 'execute'),
          'anon cannot start the nemesis draft');
select ok(has_function_privilege('authenticated', 'public.nemesis_start(uuid,uuid,text)', 'execute'),
          'authenticated callers reach the admin-gated start RPC');

create temporary table t as select tests.fixture() as d;
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b;

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'NEMESIS_INVALID%', 'cannot start while the auction draft is unfinished');

update public.drafts set status = 'complete' where id = (select d from t);
-- a leftover division from manual editing must not survive the start
update public.teams set division = 'Solari' where id = (select b from ids);

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'NOT_ADMIN%', 'a captain cannot start the nemesis draft');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Ionia') $$,
  'DIVISION_INVALID%', 'the seed division must be Lunari or Solari');

select lives_ok($$ select public.nemesis_start(
  (select d from t), (select a from ids), 'Lunari') $$,
  'admin seeds the first team and its division');
select is((select division from public.teams where id = (select a from ids)), 'Lunari',
          'the seeded team lands in the chosen division');
select is((select division from public.teams where id = (select b from ids)), null,
          'starting clears divisions left over from manual editing');
select is((select count(*) from public.nemesis_picks where draft_id = (select d from t)), 1::bigint,
          'the seed is stored as a single pick');
select ok((select chooser_team_id is null and pick_number = 0
             from public.nemesis_picks where draft_id = (select d from t)),
          'the seed is pick 0 with no chooser');

select throws_like($$ select public.nemesis_start(
  (select d from t), (select b from ids), 'Solari') $$,
  'NEMESIS_INVALID%', 'the nemesis draft cannot be started twice');

select * from finish();
rollback;
