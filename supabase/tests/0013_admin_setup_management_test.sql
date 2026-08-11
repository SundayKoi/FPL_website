begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(27);

select ok(not has_function_privilege(
  'anon', 'public.admin_assign_setup_player(uuid,uuid,uuid,integer,text)', 'execute'
), 'anon cannot execute setup assignment');
select ok(has_function_privilege(
  'authenticated', 'public.admin_assign_setup_player(uuid,uuid,uuid,integer,text)', 'execute'
), 'authenticated callers may reach the admin-gated setup assignment RPC');

select ok(not has_function_privilege(
  'anon', 'public.admin_set_setup_team_budget(uuid,uuid,integer)', 'execute'
), 'anon cannot execute setup budget changes');
select ok(not has_function_privilege(
  'anon', 'public.admin_remove_setup_player(uuid,uuid)', 'execute'
), 'anon cannot execute setup player removal');
select ok(not has_function_privilege(
  'anon', 'public.admin_remove_setup_team(uuid,uuid)', 'execute'
), 'anon cannot execute setup team removal');
select ok(has_function_privilege(
  'authenticated', 'public.admin_set_setup_team_budget(uuid,uuid,integer)', 'execute'
), 'authenticated callers may reach the admin-gated setup budget RPC');
select ok(has_function_privilege(
  'authenticated', 'public.admin_remove_setup_player(uuid,uuid)', 'execute'
), 'authenticated callers may reach the admin-gated setup player removal RPC');
select ok(has_function_privilege(
  'authenticated', 'public.admin_remove_setup_team(uuid,uuid)', 'execute'
), 'authenticated callers may reach the admin-gated setup team removal RPC');

create temporary table t as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 1';
create temporary table ids as
  select
    (select id from public.teams
      where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Captain 1') as captain_1,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Mid1') as mid1;

select tests.acting_as(tests.admin_id());
select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12, 'free_agency'
);

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_set_setup_team_budget(
  (select d from t), (select team_a from ids), 120
) $$, 'NOT_ADMIN%', 'captain cannot change setup budget');
select throws_like($$ select public.admin_remove_setup_player(
  (select d from t), (select mid1 from ids)
) $$, 'NOT_ADMIN%', 'captain cannot remove a setup player');
select throws_like($$ select public.admin_remove_setup_team(
  (select d from t), (select team_a from ids)
) $$, 'NOT_ADMIN%', 'captain cannot remove a setup team');
select ok(
  (select team_id = (select team_a from ids) and price = 12
          and acquisition::text = 'free_agency'
   from public.players where id = (select mid1 from ids))
  and
  (select budget_start = 100 and points_remaining = 88
   from public.teams where id = (select team_a from ids)),
  'failed non-admin setup operations preserve player and budget state'
);

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_set_setup_team_budget(
  (select d from t), (select team_a from ids), 120
) $$, 'admin changes setup budget through the authoritative RPC');
select is((select budget_start from public.teams where id = (select team_a from ids)), 120,
          'new setup starting budget is stored');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 108,
          'priced setup spending remains committed after a budget change');
select throws_like($$ select public.admin_set_setup_team_budget(
  (select d from t), (select team_a from ids), 11
) $$, 'BUDGET_BELOW_SPEND%', 'budget below committed setup spend is rejected');
select is((select budget_start from public.teams where id = (select team_a from ids)), 120,
          'failed budget reduction preserves the starting budget');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 108,
          'failed budget reduction preserves remaining points');

select lives_ok($$ select public.admin_remove_setup_player(
  (select d from t), (select mid1 from ids)
) $$, 'admin returns a pool-origin setup player to the pool');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select mid1 from ids)),
          'removed pool-origin player is preserved as an available pool row');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 120,
          'removing a priced pool-origin player refunds its team');

select lives_ok($$ select public.admin_remove_setup_player(
  (select d from t), (select captain_1 from ids)
) $$, 'admin removes a newly created captain prefill');
select is((select count(*) from public.players where id = (select captain_1 from ids)), 0::bigint,
          'newly created captain prefill is deleted rather than returned to the pool');

create temporary table team_case as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from team_case) and display_name = 'FA 1';
create temporary table team_case_ids as
  select
    (select id from public.teams
      where draft_id = (select d from team_case) and nomination_position = 1) as team_a,
    (select id from public.players
      where draft_id = (select d from team_case) and display_name = 'Captain 1') as captain_1,
    (select id from public.players
      where draft_id = (select d from team_case) and display_name = 'Mid1') as mid1;
select public.admin_assign_setup_player(
  (select d from team_case),
  (select mid1 from team_case_ids),
  (select team_a from team_case_ids),
  15,
  'free_agency'
);
select lives_ok($$ select public.admin_remove_setup_team(
  (select d from team_case), (select team_a from team_case_ids)
) $$, 'admin removes a setup team atomically');
select is((select count(*) from public.teams where id = (select team_a from team_case_ids)), 0::bigint,
          'setup team is deleted');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select mid1 from team_case_ids)),
          'team removal preserves its pool-origin player in the pool');
select is((select count(*) from public.players where id = (select captain_1 from team_case_ids)), 0::bigint,
          'team removal deletes its newly created captain prefill');

select * from finish();
rollback;
