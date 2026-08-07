begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- not your turn (captain 2 tries while captain 1 is nominator)
select tests.acting_as(tests.cap(2));
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'NOT_YOUR_TURN%', 'wrong captain blocked');

-- spectator/no team
select tests.acting_as(tests.admin_id());
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'NOT_CAPTAIN%', 'non-captain blocked');

-- happy path: captain 1 nominates Mid1
select tests.acting_as(tests.cap(1));
select lives_ok($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1'))
$$, 'nomination succeeds');

select is((select opening_bid from public.lots where draft_id=(select d from t) and status='open'), 10, 'opens at round-1 minimum');
select is((select current_bid from public.lots where draft_id=(select d from t) and status='open'), 10, 'current = opening');
select is((select count(*)::int from public.bids b join public.lots l on l.id=b.lot_id
           where l.draft_id=(select d from t)), 1, 'opening bid recorded');

-- second nomination while a lot is open
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Adc1'))
$$, 'LOT_OPEN_EXISTS%', 'no concurrent lots');

-- close the lot artificially, then: nominating a role you already hold
update public.lots set status='cancelled' where status='open';
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and acquisition='captain' limit 1))
$$, 'PLAYER_TAKEN%', 'rostered player blocked');

-- draft not live
update public.drafts set status='paused' where id=(select d from t);
select throws_like($$
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid2'))
$$, 'NOT_LIVE%', 'paused draft blocked');

select * from finish();
rollback;
