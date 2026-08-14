begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(3);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate(
    (select d from t),
    (select id from public.players
     where draft_id = (select d from t) and display_name = 'Mid1')
  ) as id;

select ok(public._close_lot((select id from lot), true), 'the lot closes as sold');

-- lots_announce_draft_sale is a deferrable-initially-deferred constraint trigger,
-- so it fires at COMMIT. A pgTAP test never commits (it ends in rollback), so
-- without this the assertions below run before the trigger has posted anything.
set constraints all immediate;

select ok(
  exists (
    select 1 from public.draft_chat
    where draft_id = (select d from t)
      and profile_id is null
      and body = '💰 Mid1 → Team A for 10 points'
  ),
  'a sale summary is posted to draft chat'
);

select is(
  (select count(*)::int from public.draft_chat
   where draft_id = (select d from t)
     and profile_id is null
     and body like '💰 Mid1 →%'),
  1,
  'each sale produces one summary'
);

select * from finish();
rollback;
