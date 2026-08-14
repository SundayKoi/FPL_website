begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(10);

-- A draft with real auction history: live, one lot nominated and bid on.
create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id = (select d from t) and display_name = 'Mid1')) as id;
select tests.acting_as(tests.cap(2));
select public.place_bid((select id from lot), 12);

select ok(
  (select count(*) from public.bids b join public.lots l on l.id = b.lot_id
    where l.draft_id = (select d from t)) >= 2,
  'the draft has bids on the books');

-- the reported failure: deleting a draft with bids
select lives_ok(
  format($$delete from public.drafts where id = '%s'$$, (select d from t)),
  'a draft with teams, lots and bids deletes cleanly');

select is(
  (select count(*) from public.teams where draft_id = (select d from t)),
  0::bigint, 'its teams are gone');
select is(
  (select count(*) from public.lots where draft_id = (select d from t)),
  0::bigint, 'its lots are gone');
select is(
  (select count(*) from public.bids b join public.lots l on l.id = b.lot_id
    where l.draft_id = (select d from t)),
  0::bigint, 'its bids are gone');

-- deleting a single team takes its pre-filled rows with it, pool untouched
create temporary table t2 as select tests.fixture() as d2;
delete from public.teams
  where draft_id = (select d2 from t2) and nomination_position = 1;
select is(
  (select count(*) from public.players p
    where p.draft_id = (select d2 from t2)
      and (p.display_name = 'Captain 1' or (p.team_id is null and p.role = 'mid'))),
  4::bigint, 'a deleted team''s pre-filled rows go with it; the pool is untouched');

-- Deleting a player whose winning lot forced a cascade must not raise a raw
-- FK violation on the OTHER player's auto_assigned_from_lot_id stamp: the lot
-- cascades away with the deleted player (lots_player_id_fkey), and the
-- stamped player's dangling reference to that lot must SET NULL rather than
-- block the delete (PlayerPoolEditor deletes players directly).
create temporary table t3 as select tests.fixture() as d3;
select tests.go_live((select d3 from t3));

update public.players set team_id = tm.id, price = 10, acquisition = 'auction'
  from public.teams tm
  where public.players.draft_id = (select d3 from t3)
    and tm.draft_id = (select d3 from t3)
    and ((public.players.display_name, tm.nomination_position) in
         (('Adc1', 2), ('Adc2', 3)));

select tests.acting_as(tests.cap(1));
create temporary table lot3 as
  select public.nominate((select d3 from t3),
    (select id from public.players
      where draft_id = (select d3 from t3) and display_name = 'Adc3')) as id;
update public.lots set closes_at = now() - interval '1 second' where id = (select id from lot3);
select public._close_lot((select id from lot3), true);

select ok(
  (select auto_assigned_from_lot_id from public.players
    where draft_id = (select d3 from t3) and display_name = 'Adc4') is not null,
  'Adc4 was auto-assigned from the Adc3 lot');

select lives_ok($$
  delete from public.players where id = (
    select id from public.players
      where draft_id = (select d3 from t3) and display_name = 'Adc3')
$$, 'deleting the winning player cascades its lot without an FK violation on the forced stamp');

select is(
  (select auto_assigned_from_lot_id from public.players
    where draft_id = (select d3 from t3) and display_name = 'Adc4'),
  null::uuid,
  'the forced player''s dangling lot reference is cleared, not blocked');

select ok(
  (select team_id from public.players
    where draft_id = (select d3 from t3) and display_name = 'Adc4') is not null,
  'the forced player keeps its team assignment -- only the stamp is cleared');

select * from finish();
rollback;
