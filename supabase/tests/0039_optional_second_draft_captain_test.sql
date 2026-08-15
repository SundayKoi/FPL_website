begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(11);

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000201'::uuid, 'Second'),
  ('00000000-0000-0000-0000-000000000202'::uuid, 'Second B')
on conflict (id) do nothing;

create temporary table t as select tests.fixture() as d;

select tests.acting_as(tests.admin_id());
select lives_ok($$ update public.teams
  set captain_profile_id_2 = (select id from public.profiles where display_name = 'Second')
  where id = (select id from public.teams
              where draft_id = (select d from t)
              order by nomination_position
              limit 1)
$$, 'admin can assign an optional second captain');

select lives_ok($$ update public.teams
  set captain_profile_id_2 = (select id from public.profiles where display_name = 'Second B')
  where id = (select id from public.teams
              where draft_id = (select d from t)
              order by nomination_position
              offset 1 limit 1)
$$, 'admin can assign a second captain to another team');

select throws_ok($$ update public.teams
  set captain_profile_id_2 = captain_profile_id
  where id = (select id from public.teams
              where draft_id = (select d from t)
              order by nomination_position
              limit 1)
$$, '23514', null, 'primary and second captain cannot be the same profile');

select throws_like($$ update public.teams
  set captain_profile_id_2 = (select captain_profile_id from public.teams
                              where draft_id = (select d from t)
                              order by nomination_position
                              limit 1)
  where id = (select id from public.teams
              where draft_id = (select d from t)
              order by nomination_position
              offset 1 limit 1)
$$, 'CAPTAIN_CONFLICT:%', 'a primary captain cannot also be a second captain on another team in the same draft');

select lives_ok($$ select tests.acting_as((select id from public.profiles where display_name = 'Second')) $$,
  'second captain can authenticate');
select lives_ok($$ select public.caller_team((select d from t)) $$,
  'second captain resolves the team through caller_team');

select tests.go_live((select d from t));
select lives_ok($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1'))
$$, 'second captain can nominate for the team');

select tests.acting_as((select id from public.profiles where display_name = 'Second B'));
select lives_ok($$
  select public.place_bid(
    (select id from public.lots where draft_id = (select d from t) and status = 'open'),
    11)
$$, 'second captain can bid for the team');

create temporary table t2 as select tests.fixture() as d;
select tests.acting_as(tests.admin_id());
update public.teams
  set captain_profile_id_2 = (select id from public.profiles where display_name = 'Second')
  where draft_id = (select d from t2) and nomination_position = 1;
update public.drafts set status = 'complete' where id = (select d from t2);
select public.nemesis_start(
  (select d from t2),
  (select id from public.teams where draft_id = (select d from t2) and nomination_position = 1),
  'Lunari');

select tests.acting_as((select id from public.profiles where display_name = 'Second'));
select lives_ok($$
  select public.nemesis_pick(
    (select d from t2),
    (select id from public.teams where draft_id = (select d from t2) and nomination_position = 2))
$$, 'second captain can make the nemesis pick for the team on the clock');

create temporary table t3 as select tests.fixture() as d;
update public.players
  set team_id = null, price = null, acquisition = null
  where draft_id = (select d from t3) and acquisition = 'free_agency';
select tests.acting_as(tests.admin_id());
select lives_ok(
  format($$select public.start_draft('%s')$$, (select d from t3)),
  'a team with only its primary captain still starts successfully');

create temporary table t4 as select tests.fixture() as d;
update public.players
  set team_id = null, price = null, acquisition = null
  where draft_id = (select d from t4) and acquisition = 'free_agency';
update public.teams
  set captain_profile_id = null,
      captain_profile_id_2 = (select id from public.profiles where display_name = 'Second')
  where draft_id = (select d from t4) and nomination_position = 1;
select throws_like(
  format($$select public.start_draft('%s')$$, (select d from t4)),
  '%teams missing captains%',
  'a team with no primary captain still fails start_draft');

select * from finish();
rollback;
