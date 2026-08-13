begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(6);

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

select * from finish();
rollback;
