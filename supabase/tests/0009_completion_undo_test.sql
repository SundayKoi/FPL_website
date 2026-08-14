begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(17);

-- Helper: nominate as the CURRENT nominator, picking a player whose role is
-- one of that team's still-open roles (captains can't nominate/win a role
-- they already hold), expire the lot's clock, and close it.
create or replace function tests.sell_open_role(p_d uuid) returns void
language plpgsql as $f$
declare
  v_team public.teams;
  v_role public.lol_role;
  v_player_id uuid;
  v_lot uuid;
begin
  select t.* into v_team from public.teams t
    join public.drafts d on d.current_nominator_team_id = t.id where d.id = p_d;

  select r into v_role from unnest(public.open_roles(v_team.id)) as r limit 1;

  select p.id into v_player_id from public.players p
    where p.draft_id = p_d and p.role = v_role and p.team_id is null
    limit 1;

  perform tests.acting_as(v_team.captain_profile_id);
  v_lot := public.nominate(p_d, v_player_id);
  update public.lots set closes_at = now() - interval '1 second' where id = v_lot;
  perform public.close_lot(v_lot);
end $f$;

-- === (a) Draft completion: clear the 12-player pool ===
create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

-- Sell until the board empties rather than counting to 12: forced auto-assign
-- (20260814000004) hands out the last player in a role without running a lot,
-- so the pool can drain in fewer than 12 explicit sales.
do $$
declare v_guard int := 0;
begin
  while (select status from public.drafts where id=(select d from t)) = 'live' loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;  -- 12 pool players is the ceiling on lots
    perform tests.sell_open_role((select d from t));
  end loop;
end $$;

select is((select status from public.drafts where id=(select d from t)), 'complete',
  'draft status is complete once the pool is exhausted');
select ok((select current_nominator_team_id is null from public.drafts where id=(select d from t)),
  'current_nominator_team_id is null on completion');
select is((select count(*) from public.teams tm
           where tm.draft_id=(select d from t) and cardinality(public.open_roles(tm.id)) <> 0), 0::bigint,
  'every team has 0 open roles');
select is((select count(*) from public.players
           where draft_id=(select d from t) and team_id is null), 0::bigint,
  'pool is empty');

-- === (b) Undo after completion ===
create temporary table last_lot as
  select * from public.lots where draft_id=(select d from t) and status='sold'
  order by sale_action_sequence desc, closed_at desc limit 1;

create temporary table pre_undo_points as
  select points_remaining from public.teams where id=(select leading_team_id from last_lot);

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.undo_last_sale((select d from t)) $$, 'undo runs after completion');

select is((select status from public.drafts where id=(select d from t)), 'live',
  'status reverts to live after undo');
select ok((select team_id is null from public.players where id=(select player_id from last_lot)),
  'undone player is back in the pool (team_id null)');
select ok((select price is null from public.players where id=(select player_id from last_lot)),
  'undone player price cleared');
select is((select points_remaining from public.teams where id=(select leading_team_id from last_lot)),
  (select points_remaining from pre_undo_points) + (select current_bid from last_lot),
  'points refunded to the winning team');

select is((select current_nominator_team_id from public.drafts where id=(select d from t)),
  (select nominated_by_team_id from last_lot), 'nominator restored to the lot''s nominating team');
select is((select current_round from public.drafts where id=(select d from t)),
  (select round from last_lot), 'current_round restored to the lot''s round');

-- === (c) Pause with no open lot ===
create temporary table t2 as select tests.fixture() as d;
select tests.go_live((select d from t2));

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.pause_draft((select d from t2)) $$, 'pause with no open lot runs');
select ok((select paused_time_remaining is null from public.drafts where id=(select d from t2)),
  'paused_time_remaining is NULL when no lot was open');
select is((select status from public.drafts where id=(select d from t2)), 'paused',
  'status is paused');

select lives_ok($$ select public.resume_draft((select d from t2)) $$, 'resume runs');
select is((select status from public.drafts where id=(select d from t2)), 'live',
  'status is live after resume');

-- a subsequent nomination works post-resume
select tests.acting_as(tests.cap(1));
select lives_ok($$
  select public.nominate((select d from t2),
    (select id from public.players where draft_id=(select d from t2) and display_name='Mid1'))
$$, 'nomination works after resume');

select * from finish();
rollback;
