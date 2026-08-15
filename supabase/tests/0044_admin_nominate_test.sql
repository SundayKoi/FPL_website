begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(12);

select ok(not has_function_privilege('anon', 'public.admin_nominate(uuid,uuid,integer)', 'execute'),
          'anon cannot force a nomination');
select ok(has_function_privilege('authenticated', 'public.admin_nominate(uuid,uuid,integer)', 'execute'),
          'authenticated callers may reach the admin-gated RPC');
select ok(not has_function_privilege('authenticated',
          'public._open_nomination(uuid,uuid,uuid,integer)', 'execute'),
          'the shared nomination body is not client-callable');

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table ids as
  select
    (select id from public.teams
      where draft_id = (select d from t) and nomination_position = 1) as team_a,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Mid1') as mid1,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Adc1') as adc1,
    (select id from public.players
      where draft_id = (select d from t) and display_name = 'Captain 1') as captain1;

select tests.acting_as(tests.cap(2));
select throws_like($$ select public.admin_nominate((select d from t), (select mid1 from ids)) $$,
  'NOT_ADMIN%', 'a captain cannot force a nomination');

select tests.acting_as(tests.admin_id());
select throws_like($$ select public.admin_nominate((select d from t), (select captain1 from ids)) $$,
  'PLAYER_TAKEN%', 'an already-rostered player cannot be nominated');

create temporary table lot as
  select public.admin_nominate((select d from t), (select mid1 from ids)) as id;

select ok((select id from lot) is not null, 'admin opens a lot for the team on the clock');
select is((select nominated_by_team_id from public.lots where id = (select id from lot)),
          (select team_a from ids),
          'the lot is attributed to the team on the clock, not the admin');
select is((select leading_team_id from public.lots where id = (select id from lot)),
          (select team_a from ids),
          'that team leads at the opening bid, exactly as if they had nominated');
select is((select opening_bid from public.lots where id = (select id from lot)), 10,
          'the opening bid is the round minimum');
select is((select count(*) from public.bids where lot_id = (select id from lot)), 1::bigint,
          'the opening bid is recorded as a bid');

select throws_like($$ select public.admin_nominate((select d from t), (select adc1 from ids)) $$,
  'LOT_OPEN_EXISTS%', 'no second lot while one is running');

-- A captain nominating still works through the shared body.
update public.lots set status = 'cancelled' where id = (select id from lot);
select tests.acting_as(tests.cap(1));
select lives_ok($$ select public.nominate((select d from t), (select adc1 from ids)) $$,
  'the captain path still opens a lot after the refactor');

select * from finish();
rollback;
