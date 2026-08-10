begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(14);

create temporary table t as select tests.fixture() as d;
create temporary table other as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 1';
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1,
    (select id from public.players where draft_id = (select d from other) and display_name = 'Mid1') as other_mid1;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12
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
  (select team_a from ids), 1
) $$, 'NOT_ADMIN%', 'captain cannot assign during setup');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), (select other_mid1 from ids), (select team_a from ids), 1
) $$, 'PLAYER_INVALID%', 'wrong-draft player is rejected');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select other_mid1 from ids)),
          'cross-draft rejection leaves the other draft player unchanged');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 1
) $$, 'PLAYER_TAKEN%', 'occupied player is rejected');
select ok((select team_id = (select team_a from ids) and price = 12
                  and acquisition::text = 'free_agency'
           from public.players where id = (select mid1 from ids)),
          'occupied-player rejection preserves the assigned player state');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t),
  (select id from public.players where draft_id = (select d from t) and display_name = 'Mid2'),
  (select team_a from ids), 1
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
  999
) $$, 'INSUFFICIENT_POINTS%', 'insufficient setup points are rejected');

select * from finish();
rollback;
