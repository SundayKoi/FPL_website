begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(9);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- team ids by position, for readability
create temporary table tm as
  select nomination_position as pos, id from public.teams where draft_id=(select d from t);

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id=(select d from t) and display_name='Mid1')) as id;

-- not expired yet -> no-op
select is(public.close_lot((select id from lot)), false, 'unexpired lot is a no-op');

-- captain 2 outbids, then we expire the clock manually
select tests.acting_as(tests.cap(2));
select public.place_bid((select id from lot), 15);
update public.lots set closes_at = now() - interval '1 second' where id=(select id from lot);

select is(public.close_lot((select id from lot)), true, 'expired lot closes');
select is(public.close_lot((select id from lot)), false, 'second close is a no-op (idempotent)');

select is((select team_id from public.players where display_name='Mid1' and draft_id=(select d from t)),
          (select id from tm where pos=2), 'player joined winning team');
select is((select price from public.players where display_name='Mid1' and draft_id=(select d from t)),
          15, 'price recorded');
select is((select points_remaining from public.teams where id=(select id from tm where pos=2)),
          75, '90 - 15 deducted');

-- turn advanced to position 2 (round 1 ascends)
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=2), 'nomination moved to position 2');

-- Fast-forward: sell mids to teams 2,3,4 via nominations, ending round 1.
-- Helper inline: nominate as current nominator, expire, close.
create or replace function tests.sell_next(p_d uuid, p_name text) returns void
language plpgsql as $f$
declare v_team public.teams; v_lot uuid;
begin
  select t.* into v_team from public.teams t
    join public.drafts d on d.current_nominator_team_id = t.id where d.id = p_d;
  perform tests.acting_as(v_team.captain_profile_id);
  v_lot := public.nominate(p_d, (select id from public.players where draft_id=p_d and display_name=p_name));
  update public.lots set closes_at = now() - interval '1 second' where id = v_lot;
  perform public.close_lot(v_lot);
end $f$;

-- pos 2 already owns a mid (they won Mid1), so their nomination must be another role
select tests.sell_next((select d from t), 'Adc1');   -- pos 2 nominates & buys an adc
select tests.sell_next((select d from t), 'Mid2');   -- pos 3
select tests.sell_next((select d from t), 'Mid3');   -- pos 4 -> pass complete

-- Positions 1-4 have each nominated once (pos 1's nomination was WON by pos 2 —
-- it still counts as pos 1's nomination), so the pass is complete: round 2,
-- order snakes, position 4 nominates first. Pos 1 still needs a mid; they'll
-- get one on a later nomination.
select is((select current_round from public.drafts where id=(select d from t)), 2, 'round advanced after full pass');
select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
          (select id from tm where pos=4), 'snake: position 4 opens round 2');

select * from finish();
rollback;
