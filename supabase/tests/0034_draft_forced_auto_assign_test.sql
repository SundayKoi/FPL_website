begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(10);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- Fixture roles: every team already has top+jungle; pools of 4 for
-- mid/adc/support. Team budgets 100/90/80/70 at positions 1-4.

-- Forced state for MID: three of four mids assigned directly, so one mid
-- remains and only Team D (pos 4) still needs one.
update public.players set team_id = tm.id, price = 10, acquisition = 'auction'
  from public.teams tm
  where public.players.draft_id = (select d from t)
    and tm.draft_id = (select d from t)
    and ((public.players.display_name, tm.nomination_position) in
         (('Mid1', 1), ('Mid2', 2), ('Mid3', 3)));

select public._auto_assign_forced((select d from t), null);

select is(
  (select tm.nomination_position from public.players p join public.teams tm on tm.id = p.team_id
    where p.draft_id = (select d from t) and p.display_name = 'Mid4'),
  4, 'the last mid lands on the only team missing one');

select is(
  (select price from public.players where draft_id = (select d from t) and display_name = 'Mid4'),
  1, 'forced assignment costs exactly 1 point');

select is(
  (select points_remaining from public.teams
    where draft_id = (select d from t) and nomination_position = 4),
  69, 'the point is deducted from the receiving team');

select ok(
  exists (select 1 from public.draft_chat
          where draft_id = (select d from t) and profile_id is null
            and body like '%Mid4%last MID%'),
  'the board is told about the auto-assign');

-- contested roles never auto-assign: shrink the support pool to 3 (delete
-- Support4), assign two — one support left but TWO teams still need one
delete from public.players
  where draft_id = (select d from t) and display_name = 'Support4';
update public.players set team_id = tm.id, price = 5, acquisition = 'auction'
  from public.teams tm
  where public.players.draft_id = (select d from t)
    and tm.draft_id = (select d from t)
    and ((public.players.display_name, tm.nomination_position) in
         (('Support1', 1), ('Support2', 2)));

select public._auto_assign_forced((select d from t), null);

select ok(
  (select team_id from public.players
    where draft_id = (select d from t) and display_name = 'Support3') is null,
  'a role two teams still need is never auto-assigned');

-- close_lot integration: the sale that empties a role's contest triggers the
-- cascade in the same close. ADC: give B and C theirs directly, then Team A
-- (nominator) opens a lot on Adc3 and wins it — leaving Adc4 forced to D.
update public.players set team_id = tm.id, price = 10, acquisition = 'auction'
  from public.teams tm
  where public.players.draft_id = (select d from t)
    and tm.draft_id = (select d from t)
    and ((public.players.display_name, tm.nomination_position) in
         (('Adc1', 2), ('Adc2', 3)));

select tests.acting_as(tests.cap(1));
create temporary table lot as
  select public.nominate((select d from t),
    (select id from public.players where draft_id = (select d from t) and display_name = 'Adc3')) as id;

select ok(public._close_lot((select id from lot), true), 'the lot force-closes');

select is(
  (select tm.nomination_position from public.players p join public.teams tm on tm.id = p.team_id
    where p.draft_id = (select d from t) and p.display_name = 'Adc3'),
  1, 'the auctioned adc goes to the winning bidder');

select is(
  (select tm.nomination_position from public.players p join public.teams tm on tm.id = p.team_id
    where p.draft_id = (select d from t) and p.display_name = 'Adc4'),
  4, 'the now-forced last adc cascades to the only team missing one');

select is(
  (select price from public.players where draft_id = (select d from t) and display_name = 'Adc4'),
  1, 'the cascaded assignment also costs 1 point');

select ok(
  (select current_nominator_team_id from public.drafts where id = (select d from t)) is not null
  and (select status from public.drafts where id = (select d from t)) = 'live',
  'the draft continues with a valid nominator after the cascade');

select * from finish();
rollback;
