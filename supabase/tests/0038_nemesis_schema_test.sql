begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

select has_table('public', 'nemesis_picks', 'nemesis_picks table exists');
select col_is_pk('public', 'nemesis_picks', 'id', 'id is the primary key');

create temporary table t as select tests.fixture() as d;
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as b;

insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 0, null, (select a from ids), 'Lunari');

prepare dup_pick_number as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 0, null, (select b from ids), 'Solari');
select throws_ok('dup_pick_number', '23505', null, 'a pick number cannot repeat within a draft');

prepare dup_chosen as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 1, (select b from ids), (select a from ids), 'Solari');
select throws_ok('dup_chosen', '23505', null, 'a team cannot be placed twice in one draft');

prepare seed_with_chooser as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 2, (select a from ids), (select b from ids), 'Solari');
select lives_ok('seed_with_chooser', 'a later pick may carry a chooser');

prepare later_without_chooser as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 3, null, (select b from ids), 'Solari');
select throws_ok('later_without_chooser', '23514', null, 'only pick 0 may omit the chooser');

prepare bad_division as
  insert into public.nemesis_picks (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
  values ((select d from t), 4, (select a from ids), (select b from ids), 'Ionia');
select throws_ok('bad_division', '23514', null, 'division must be Lunari or Solari');

select ok(has_table_privilege('anon', 'public.nemesis_picks', 'select'),
          'spectators can read the nemesis chain');
select ok(not has_table_privilege('authenticated', 'public.nemesis_picks', 'insert'),
          'clients cannot insert picks directly');

select * from finish();
rollback;
