begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));
create temporary table tm as
  select nomination_position as pos, id from public.teams where draft_id=(select d from t);

-- cancel: nomination voided, turn kept
select tests.acting_as(tests.cap(1));
create temporary table lot1 as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;
select tests.acting_as(tests.cap(1));
select throws_like($$ select public.cancel_lot((select id from lot1)) $$,
  'NOT_ADMIN%', 'captain cannot cancel');
select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.cancel_lot((select id from lot1)) $$, 'admin cancels');
select is((select status from public.lots where id=(select id from lot1)), 'cancelled', 'lot cancelled');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=1), 'nominator keeps the turn');
select ok((select team_id is null from public.players
           where draft_id=(select d from t) and display_name='Mid1'), 'player still available');

-- force close: settles now at current bid
select tests.acting_as(tests.cap(1));
create temporary table lot2 as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;
select tests.acting_as(tests.admin_id());
select is(public.force_close_lot((select id from lot2)), true, 'force close settles');
select is((select team_id from public.players where draft_id=(select d from t) and display_name='Mid1'),
          (select id from tm where pos=1), 'nominator bought at opening bid');

-- undo: everything reverts
select lives_ok($$ select public.undo_last_sale((select d from t)) $$, 'undo runs');
select ok((select team_id is null and price is null from public.players
           where draft_id=(select d from t) and display_name='Mid1')
      and (select points_remaining = 100 from public.teams where id=(select id from tm where pos=1))
      and (select current_nominator_team_id = (select id from tm where pos=1)
           from public.drafts where id=(select d from t)),
      'player back in pool, points refunded, turn restored');

select * from finish();
rollback;
