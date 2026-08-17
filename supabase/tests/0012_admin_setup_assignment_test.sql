begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(18);

create temporary table t as select tests.fixture() as d;
create temporary table other as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 1';
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1,
    (select id from public.players where draft_id = (select d from other) and display_name = 'Mid1') as other_mid1;

-- admin_assign_setup_player is owner-gated (2026-08-23): act as an owner
-- throughout this file's assignment calls, not the plain admin fixture.
select tests.acting_as(tests.owner_id());
select lives_ok($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12, 'free_agency'
) $$, 'admin assigns an existing pool player during setup');
select is((select team_id from public.players where id = (select mid1 from ids)),
          (select team_a from ids), 'setup player is assigned to the selected team');
select is((select price from public.players where id = (select mid1 from ids)), 12,
          'setup point value is stored');
select is((select acquisition::text from public.players where id = (select mid1 from ids)), 'free_agency',
          'setup assignment is marked free agency');
select is((select points_remaining from public.teams where id = (select team_a from ids)), 88,
          'setup assignment deducts team points');
select is((select status::text from public.drafts where id = (select d from t)), 'setup',
          'setup assignment does not change draft status');

select tests.acting_as(tests.cap(1));
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1, 'free_agency'
) $$, 'NOT_OWNER%', 'captain cannot assign during setup');

select tests.acting_as(tests.owner_id());
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), (select other_mid1 from ids), (select team_a from ids), 1, 'free_agency'
) $$, 'PLAYER_INVALID%', 'wrong-draft player is rejected');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select other_mid1 from ids)),
          'cross-draft rejection leaves the other draft player unchanged');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 1, 'free_agency'
) $$, 'PLAYER_TAKEN%', 'occupied player is rejected');
select ok((select team_id = (select team_a from ids) and price = 12
                  and acquisition::text = 'free_agency'
           from public.players where id = (select mid1 from ids)),
          'occupied-player rejection preserves the assigned player state');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1, 'free_agency'
) $$, 'SETUP_FULL%', 'full prefill team is rejected');
select ok((select team_id is null and price is null from public.players
           where draft_id = (select d from t) and display_name = 'Mid2'),
          'failed setup assignment leaves player in the pool');
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 2';
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Adc2'),
  (select id from public.teams where draft_id = (select d from t) and nomination_position = 2),
  999,
  'free_agency'
) $$, 'INSUFFICIENT_POINTS%', 'insufficient setup points are rejected');
select is((select points_remaining from public.teams
           where draft_id = (select d from t) and nomination_position = 2), 90,
          'insufficient-points rejection preserves the team budget');

create temporary table role_case as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from role_case) and display_name = 'FA 1';
insert into public.players (draft_id, display_name, role)
values ((select d from role_case), 'Pool Top', 'top');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from role_case),
  (select id from public.players where draft_id = (select d from role_case) and display_name = 'Pool Top'),
  (select id from public.teams where draft_id = (select d from role_case) and nomination_position = 1),
  5,
  'free_agency'
) $$, 'ROLE_FILLED%', 'filled setup role is rejected before mutation');
select ok((select team_id is null and price is null and acquisition is null
           from public.players
           where draft_id = (select d from role_case) and display_name = 'Pool Top'),
          'role-filled rejection leaves the player in the pool');
select is((select points_remaining from public.teams
           where draft_id = (select d from role_case) and nomination_position = 1), 100,
          'role-filled rejection preserves the team budget');

select * from finish();
rollback;
