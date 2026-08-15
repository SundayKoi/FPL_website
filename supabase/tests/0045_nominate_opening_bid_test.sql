begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

select ok(has_function_privilege('authenticated', 'public.nominate(uuid,uuid,integer)', 'execute'),
          'captains can reach the three-argument nominate');
select ok(not has_function_privilege('authenticated',
          'public._open_nomination(uuid,uuid,uuid,integer)', 'execute'),
          'the shared body stays internal');
-- Leaving the old signatures behind would make every two-argument call
-- ambiguous, so they must be gone.
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'nominate'
     and pg_get_function_identity_arguments(p.oid) = 'uuid, uuid'
), 'the two-argument nominate overload is gone');

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table ids as
  select
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Mid1') as mid1,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Adc1') as adc1,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Support1') as sup1;

-- Team A is on the clock with 100 points and three open roles, so its cap is
-- 100 - 2 = 98. Round one opens at 10.
select tests.acting_as(tests.cap(1));

select throws_like($$ select public.nominate((select d from t), (select mid1 from ids), 9) $$,
  'UNDER_MINIMUM%', 'an opening bid below the round minimum is rejected');
select throws_like($$ select public.nominate((select d from t), (select mid1 from ids), 99) $$,
  'OVER_CAP%', 'an opening bid above the max is rejected');
select is((select count(*) from public.lots where draft_id = (select d from t)), 0::bigint,
          'no lot is created by a rejected nomination');

create temporary table lot as
  select public.nominate((select d from t), (select mid1 from ids), 30) as id;
select is((select opening_bid from public.lots where id = (select id from lot)), 30,
          'the nominator opens above the minimum');
select is((select current_bid from public.lots where id = (select id from lot)), 30,
          'the raised opening bid is the current bid');
select is((select amount from public.bids where lot_id = (select id from lot)), 30,
          'the opening bid is recorded at the raised amount');

-- Omitting the amount still means the round minimum, as it always did.
update public.lots set status = 'cancelled' where id = (select id from lot);
create temporary table lot2 as
  select public.nominate((select d from t), (select adc1 from ids)) as id;
select is((select opening_bid from public.lots where id = (select id from lot2)), 10,
          'omitting the amount still opens at the round minimum');

-- The admin path takes an amount too.
update public.lots set status = 'cancelled' where id = (select id from lot2);
select tests.acting_as(tests.admin_id());
create temporary table lot3 as
  select public.admin_nominate((select d from t), (select sup1 from ids), 25) as id;
select is((select opening_bid from public.lots where id = (select id from lot3)), 25,
          'an admin can force a nomination above the minimum');
select is((select nominated_by_team_id from public.lots where id = (select id from lot3)),
          (select current_nominator_team_id from public.drafts where id = (select d from t)),
          'the forced lot still belongs to the team on the clock');

select * from finish();
rollback;
