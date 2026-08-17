-- 2026-08-23: seed_academy_regular_season(), admin_assign_setup_player(),
-- and admin_reorder_setup_teams() moved from admin-tier to owner-tier
-- (20260823000012_owner_only_definer_rpcs.sql). Prove a plain admin is
-- refused by all three and an owner is not.

begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(6);

create temporary table t as select tests.fixture() as d;
grant select on t to authenticated;
-- team_a already carries two prefilled players (captain + free agency slot);
-- free one so the owner's assignment below has a role left to fill.
delete from public.players
 where draft_id = (select d from t) and display_name = 'FA 1';
create temporary table ids as
  select
    (select id from public.teams where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1') as mid1;
grant select on ids to authenticated;
create temporary table order_ids as
  select array_agg(id order by nomination_position desc) as reversed
  from public.teams where draft_id = (select d from t);
grant select on order_ids to authenticated;

insert into public.profiles (id, display_name, is_admin, is_owner)
values (tests.admin_id(), 'Admin', true, false),
       (tests.owner_id(), 'Owner', true, true)
on conflict (id) do update set is_admin = excluded.is_admin, is_owner = excluded.is_owner;

-- seed_academy_regular_season -----------------------------------------------
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.seed_academy_regular_season() $$, 'NOT_OWNER%',
                   'a plain admin cannot seed the Academy regular season');
reset role;

select tests.acting_as(tests.owner_id());
set local role authenticated;
-- No academy draft is configured on a fresh test database, so this is a
-- clean no-op (0 fixtures written) rather than an exception.
select is((select public.seed_academy_regular_season()), 0,
          'an owner with no academy draft configured gets a no-op, not an error');
reset role;

-- admin_assign_setup_player ---------------------------------------------------
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12, 'free_agency'
) $$, 'NOT_OWNER%', 'a plain admin cannot assign a setup player');
reset role;

select tests.acting_as(tests.owner_id());
set local role authenticated;
select lives_ok($$ select public.admin_assign_setup_player(
  (select d from t), (select mid1 from ids), (select team_a from ids), 12, 'free_agency'
) $$, 'an owner can assign a setup player');
reset role;

-- admin_reorder_setup_teams ----------------------------------------------------
select tests.acting_as(tests.admin_id());
set local role authenticated;
select throws_like($$ select public.admin_reorder_setup_teams(
  (select d from t), (select reversed from order_ids)
) $$, 'NOT_OWNER%', 'a plain admin cannot reorder setup teams');
reset role;

select tests.acting_as(tests.owner_id());
set local role authenticated;
select lives_ok($$ select public.admin_reorder_setup_teams(
  (select d from t), (select reversed from order_ids)
) $$, 'an owner can reorder setup teams');
reset role;

select * from finish();
rollback;
