begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc

select plan(6);

create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- Fixture: 4 teams at positions 1-4, each with 3 open roles (mid/adc/support),
-- round 1 minimum 10. Affordability = points_remaining - 2 >= minimum.

-- Team B (pos 2) goes broke: 5 points can't open a 10-point lot
update public.teams set points_remaining = 5
  where draft_id = (select d from t) and nomination_position = 2;

select public._advance_turn((select dr from public.drafts dr where id = (select d from t)));

select is(
  (select nomination_position from public.teams
    where id = (select current_nominator_team_id from public.drafts where id = (select d from t))),
  3, 'the broke team at position 2 is skipped; position 3 nominates');

select is(
  (select current_round from public.drafts where id = (select d from t)),
  1, 'round is unchanged when a later team can still afford the minimum');

select ok(
  exists (select 1 from public.draft_chat
          where draft_id = (select d from t)
            and profile_id is null
            and body like '%Team B%skipped%'),
  'the board is told who was skipped and why');

-- Whole-pass rollover: nobody can afford round 1's minimum of 10, everyone
-- keeps the 1-per-open-slot reserve (5 points, 3 open roles). Minimums are
-- {10,5,1}: round 2 needs 7, still short; round 3 needs 3 — affordable.
update public.teams set points_remaining = 5 where draft_id = (select d from t);
update public.drafts
  set current_nominator_team_id = (select id from public.teams
                                   where draft_id = (select d from t) and nomination_position = 1)
  where id = (select d from t);

select public._advance_turn((select dr from public.drafts dr where id = (select d from t)));

select is(
  (select current_round from public.drafts where id = (select d from t)),
  3, 'rounds roll forward until a minimum someone can afford');

select ok(
  (select current_nominator_team_id from public.drafts where id = (select d from t)) is not null,
  'a nominator is found at the affordable round');

select is(
  (select status from public.drafts where id = (select d from t)),
  'live', 'the draft is not wrongly completed by the skip logic');

select * from finish();
rollback;
