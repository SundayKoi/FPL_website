begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;

-- leader can't raise themselves
select throws_like($$ select public.place_bid((select id from lot), 11) $$,
  'ALREADY_LEADING%', 'leader cannot self-raise');

-- raise must be >= current + 1
select tests.acting_as(tests.cap(2));
select throws_like($$ select public.place_bid((select id from lot), 10) $$,
  'BID_TOO_LOW%', 'equal bid rejected');

-- happy path resets the clock
select lives_ok($$ select public.place_bid((select id from lot), 11) $$, 'valid raise');
select is((select current_bid from public.lots where id=(select id from lot)), 11, 'bid recorded');
select is((select leading_team_id from public.lots where id=(select id from lot)),
          (select id from public.teams where draft_id=(select d from t) and nomination_position=2),
          'leader updated');
select ok((select closes_at > now() + interval '10 seconds' from public.lots where id=(select id from lot)),
          'countdown reset');

-- role you already hold: give captain 3 a mid, then they bid on a mid
update public.players set team_id=(select id from public.teams where draft_id=(select d from t) and nomination_position=3),
  price=1, acquisition='auction'
  where draft_id=(select d from t) and display_name='Mid4';
select tests.acting_as(tests.cap(3));
select throws_like($$ select public.place_bid((select id from lot), 12) $$,
  'ROLE_FILLED%', 'role-filled bidder blocked');

-- cap: captain 4 has 70 pts, 3 open roles -> max bid 68
select tests.acting_as(tests.cap(4));
select throws_like($$ select public.place_bid((select id from lot), 69) $$,
  'OVER_CAP%', 'cap enforced');

-- expired lot rejects bids
update public.lots set closes_at = now() - interval '1 second' where id=(select id from lot);
select throws_like($$ select public.place_bid((select id from lot), 20) $$,
  'LOT_EXPIRED%', 'expired lot rejects bids');

select * from finish();
rollback;
