begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(15);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 2) as team_b,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12
) $$, 'admin assigns an available player');
select is((select team_id from public.players where id = (select mid1 from ids)),
          (select team_a from ids), 'player is assigned to selected team');
select is((select price from public.players where id = (select mid1 from ids)), 12,
          'entered price is stored');
select is((select acquisition::text from public.players where id = (select mid1 from ids)), 'admin',
          'assignment is marked as admin acquisition');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 88,
          'team points are deducted');
select is((select current_nominator_team_id from public.drafts where id = (select d from t)),
          (select team_b from ids), 'normal nomination turn advancement is used');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_assign_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 1
) $$, 'NOT_ADMIN%', 'captain cannot assign directly');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 999
) $$, 'INSUFFICIENT_POINTS%', 'overspending is rejected');
select ok((select team_id is null and price is null from public.players
           where draft_id = (select d from t) and display_name = 'Mid2'),
          'failed assignment leaves player unchanged');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  gen_random_uuid(),
  (select team_a from ids), 1
) $$, 'PLAYER_INVALID%', 'player from another draft is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select mid1 from ids),
  gen_random_uuid(), 1
) $$, 'TEAM_INVALID%', 'team from another draft is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Captain 1'),
  (select team_a from ids), 1
) $$, 'PLAYER_TAKEN%', 'rostered player is rejected');
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1
) $$, 'ROLE_FILLED%', 'filled role is rejected');

create temporary table completion as select tests.fixture() as d;
select tests.go_live((select d from completion));
select tests.acting_as(tests.admin_id());
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Mid4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Adc4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support1'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 1), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support2'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 2), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support3'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 3), 0);
select public.admin_assign_player((select d from completion), (select id from public.players where draft_id = (select d from completion) and display_name = 'Support4'), (select id from public.teams where draft_id = (select d from completion) and nomination_position = 4), 0);
select is((select status::text from public.drafts where id = (select d from completion)), 'complete', 'last assignment completes draft');

select tests.acting_as(tests.cap(2));
select public.nominate((select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'));
select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid3'),
  (select team_a from ids), 1
) $$, 'LOT_OPEN_EXISTS%', 'open auction blocks direct assignment');

select * from finish();
rollback;
