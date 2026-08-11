begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(25);

create temporary table captain_case as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from captain_case) and display_name = 'Captain 1';
delete from public.players
 where draft_id = (select d from captain_case) and display_name = 'FA 1';
create temporary table captain_ids as
  select
    (select id from public.teams where draft_id = (select d from captain_case) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from captain_case) and display_name = 'Mid1') as captain_candidate,
    (select id from public.players where draft_id = (select d from captain_case) and display_name = 'Adc1') as second_captain_candidate;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.admin_assign_setup_player(
  (select d from captain_case),
  (select captain_candidate from captain_ids),
  (select team_a from captain_ids),
  15,
  'captain'
) $$, 'admin assigns a priced captain during setup');
select is((select acquisition::text from public.players where id = (select captain_candidate from captain_ids)), 'captain',
          'captain acquisition is persisted');
select is((select price from public.players where id = (select captain_candidate from captain_ids)), 15,
          'captain price is stored');
select is((select points_remaining from public.teams where id = (select team_a from captain_ids)), 85,
          'captain assignment deducts team points');

select throws_like($$ select public.admin_assign_setup_player(
  (select d from captain_case),
  (select second_captain_candidate from captain_ids),
  (select team_a from captain_ids),
  5,
  'captain'
) $$, 'SETUP_ACQUISITION_TAKEN%', 'duplicate captain setup acquisition is rejected');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select second_captain_candidate from captain_ids)),
          'duplicate captain rejection leaves the second player unassigned');
select is((select points_remaining from public.teams where id = (select team_a from captain_ids)), 85,
          'duplicate captain rejection preserves the team budget');
select ok((select team_id = (select team_a from captain_ids) and price = 15 and acquisition::text = 'captain'
           from public.players where id = (select captain_candidate from captain_ids)),
          'duplicate captain rejection preserves the first captain assignment');
select lives_ok($$ select public.admin_remove_setup_player(
  (select d from captain_case),
  (select captain_candidate from captain_ids)
) $$, 'admin removes a priced captain setup player');
select is((select count(*) from public.players where id = (select captain_candidate from captain_ids)), 0::bigint,
          'removed captain setup player is deleted');
select is((select points_remaining from public.teams where id = (select team_a from captain_ids)), 100,
          'removing a captain setup player refunds its team');

create temporary table free_agency_case as select tests.fixture() as d;
delete from public.players
 where draft_id = (select d from free_agency_case) and display_name = 'Captain 1';
delete from public.players
 where draft_id = (select d from free_agency_case) and display_name = 'FA 1';
create temporary table free_agency_ids as
  select
    (select id from public.teams where draft_id = (select d from free_agency_case) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from free_agency_case) and display_name = 'Mid1') as free_agency_candidate,
    (select id from public.players where draft_id = (select d from free_agency_case) and display_name = 'Adc1') as invalid_candidate,
    (select id from public.players where draft_id = (select d from free_agency_case) and display_name = 'Support1') as second_free_agency_candidate;

select lives_ok($$ select public.admin_assign_setup_player(
  (select d from free_agency_case),
  (select free_agency_candidate from free_agency_ids),
  (select team_a from free_agency_ids),
  20,
  'free_agency'
) $$, 'admin assigns a priced free agency setup player');
select is((select acquisition::text from public.players where id = (select free_agency_candidate from free_agency_ids)), 'free_agency',
          'free agency acquisition is persisted');
select is((select price from public.players where id = (select free_agency_candidate from free_agency_ids)), 20,
          'free agency price is stored');
select is((select points_remaining from public.teams where id = (select team_a from free_agency_ids)), 80,
          'free agency assignment deducts team points');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from free_agency_case),
  (select invalid_candidate from free_agency_ids),
  (select team_a from free_agency_ids),
  5,
  'auction'
) $$, 'SETUP_ACQUISITION_INVALID%', 'auction is rejected during setup');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from free_agency_case),
  (select invalid_candidate from free_agency_ids),
  (select team_a from free_agency_ids),
  5,
  null
) $$, 'SETUP_ACQUISITION_INVALID%', 'null setup acquisition is rejected during setup');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select invalid_candidate from free_agency_ids)),
          'invalid setup acquisition leaves the player in the pool');
select is((select points_remaining from public.teams where id = (select team_a from free_agency_ids)), 80,
          'invalid setup acquisition preserves the team budget');
select throws_like($$ select public.admin_assign_setup_player(
  (select d from free_agency_case),
  (select second_free_agency_candidate from free_agency_ids),
  (select team_a from free_agency_ids),
  7,
  'free_agency'
) $$, 'SETUP_ACQUISITION_TAKEN%', 'duplicate free agency setup acquisition is rejected');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select second_free_agency_candidate from free_agency_ids)),
          'duplicate free agency rejection leaves the second player unassigned');
select is((select points_remaining from public.teams where id = (select team_a from free_agency_ids)), 80,
          'duplicate free agency rejection preserves the team budget');
select lives_ok($$ select public.admin_remove_setup_player(
  (select d from free_agency_case),
  (select free_agency_candidate from free_agency_ids)
) $$, 'admin removes a priced free agency setup player');
select ok((select team_id is null and price is null and acquisition is null
           from public.players where id = (select free_agency_candidate from free_agency_ids)),
          'removed free agency setup player returns to the pool');
select is((select points_remaining from public.teams where id = (select team_a from free_agency_ids)), 100,
          'removing a free agency setup player refunds its team');

select * from finish();
rollback;
