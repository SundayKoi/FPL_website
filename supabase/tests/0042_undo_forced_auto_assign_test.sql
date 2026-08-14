begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(16);

select has_column('public', 'players', 'auto_assigned_from_lot_id',
                  'players records the lot that forced an auto-assignment');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_auto_assign_forced'
     and pg_get_function_identity_arguments(p.oid) = 'uuid'
), 'the stale one-argument _auto_assign_forced overload is gone');

-- Four teams, each needing mid/adc/support. Sell mid and adc down to the last
-- support pair so the next close forces an auto-assignment.
create temporary table t as select tests.fixture() as d;
select tests.go_live((select d from t));

create or replace function tests.sell_open_role(p_d uuid) returns void
language plpgsql as $f$
declare
  v_team public.teams; v_role public.lol_role; v_player_id uuid; v_lot uuid;
begin
  select t.* into v_team from public.teams t
    join public.drafts d on d.current_nominator_team_id = t.id where d.id = p_d;
  select r into v_role from unnest(public.open_roles(v_team.id)) as r limit 1;
  select p.id into v_player_id from public.players p
    where p.draft_id = p_d and p.role = v_role and p.team_id is null limit 1;
  perform tests.acting_as(v_team.captain_profile_id);
  v_lot := public.nominate(p_d, v_player_id);
  update public.lots set closes_at = now() - interval '1 second' where id = v_lot;
  perform public.close_lot(v_lot);
end $f$;

do $$
declare v_guard int := 0;
begin
  while (select status from public.drafts where id = (select d from t)) = 'live' loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;
    perform tests.sell_open_role((select d from t));
  end loop;
end $$;

-- Compare league-wide totals, not per team: the sale being undone can refund
-- the very team that also received a forced assignment, so a per-team equality
-- would be off by the lot's winning bid.
create temporary table undo_target as
  select id, current_bid from public.lots
   where draft_id = (select d from t) and status = 'sold'
   order by coalesce(sale_action_sequence, 0) desc, closed_at desc, created_at desc
   limit 1;

-- Scope to the cascade caused by the specific lot about to be undone, not
-- every forced assignment across the whole drain: this fixture's three
-- contested roles (mid/adc/support) each independently reach their own
-- "one pool player, one team missing it" threshold at a different lot close,
-- so more than one triggering lot forces an assignment over the full drain.
-- undo_last_sale only reverses the cascade tied to the lot it undoes.
create temporary table forced as
  select * from public.players
   where draft_id = (select d from t)
     and auto_assigned_from_lot_id = (select id from undo_target);

select ok((select count(*) from forced) > 0,
          'closing the last contested lot forces at least one auto-assignment');

create temporary table before_undo as
  select p.id as player_id from forced p;

create temporary table totals as
  select (select coalesce(sum(points_remaining), 0) from public.teams
           where draft_id = (select d from t)) as points,
         (select coalesce(sum(coalesce(price, 0)), 0) from forced) as forced_spend;

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.undo_last_sale((select d from t)) $$,
  'admin undoes the sale that triggered the cascade');

select is((select count(*) from public.players
            where id in (select player_id from before_undo)
              and (team_id is not null or auto_assigned_from_lot_id is not null)),
          0::bigint,
          'every auto-assigned player returns to the pool with the stamp cleared');
select is((select count(*) from public.players
            where id in (select player_id from before_undo)
              and (price is not null or acquisition is not null)),
          0::bigint,
          'returned auto-assigned players lose their price and acquisition');
select is(
  (select coalesce(sum(points_remaining), 0) from public.teams where draft_id = (select d from t)),
  (select points + forced_spend from totals) + (select current_bid from undo_target),
  'the league is refunded both the sale and every point its cascade cost');

-- === Multi-player cascade: two players force-assigned to the SAME team by
-- the SAME lot close. This is where a naive `UPDATE ... FROM` refund (which
-- Postgres collapses to one arbitrary source row per target row when the
-- join yields several source rows) under-pays: it must aggregate per team,
-- not join row-for-row against the stamped players.
create temporary table t3 as select tests.fixture() as d3;
select tests.go_live((select d3 from t3));

-- Fill adc and support directly for teams A, B, C (positions 1-3), leaving
-- Adc4/Support4 unassigned and needed only by team D (position 4). Both
-- conditions are already true before any lot closes.
update public.players set team_id = tm.id, price = 5, acquisition = 'auction'
  from public.teams tm
  where public.players.draft_id = (select d3 from t3)
    and tm.draft_id = (select d3 from t3)
    and ((public.players.display_name, tm.nomination_position) in
         (('Adc1', 1), ('Adc2', 2), ('Adc3', 3),
          ('Support1', 1), ('Support2', 2), ('Support3', 3)));

create temporary table pre_cascade_d as
  select points_remaining from public.teams
   where draft_id = (select d3 from t3) and nomination_position = 4;

-- Team A (the live nominator, now only missing mid) sells a mid player: an
-- ordinary, unrelated sale that merely pokes _auto_assign_forced into
-- re-checking every role, discovering BOTH pending forced conditions in the
-- same call.
select tests.acting_as(tests.cap(1));
create temporary table mid_lot as
  select public.nominate((select d3 from t3),
    (select id from public.players
      where draft_id = (select d3 from t3) and display_name = 'Mid1')) as id;
update public.lots set closes_at = now() - interval '1 second'
  where id = (select id from mid_lot);

select ok(public.close_lot((select id from mid_lot)), 'the poking mid lot closes');

select is(
  (select count(*) from public.players
    where draft_id = (select d3 from t3)
      and display_name in ('Adc4', 'Support4')
      and auto_assigned_from_lot_id = (select id from mid_lot)),
  2::bigint,
  'closing the mid lot cascades both Adc4 and Support4 to team D in one go');

select is(
  (select points_remaining from public.teams
    where draft_id = (select d3 from t3) and nomination_position = 4),
  (select points_remaining from pre_cascade_d) - 2,
  'team D is charged 1 point per cascaded player');

select tests.acting_as(tests.admin_id());
select lives_ok($$ select public.undo_last_sale((select d3 from t3)) $$,
  'admin undoes the mid sale that triggered the double cascade');

select is(
  (select count(*) from public.players
    where draft_id = (select d3 from t3)
      and display_name in ('Adc4', 'Support4')
      and (team_id is not null or auto_assigned_from_lot_id is not null)),
  0::bigint,
  'both cascaded players return to the pool');

select is(
  (select points_remaining from public.teams
    where draft_id = (select d3 from t3) and nomination_position = 4),
  (select points_remaining from pre_cascade_d),
  'team D is refunded both cascade points, not just one');

-- === swap_roster_players severs the auto-assign stamp (Finding 5): once
-- Finding 1 makes undo reachable post-completion (exactly when swaps happen),
-- a swap that left the stamp in place would let a later undo of the old
-- triggering lot yank the swapped-in player back out of their new team.
create temporary table t5 as select tests.fixture() as d5;
select tests.go_live((select d5 from t5));

do $$
declare v_guard int := 0;
begin
  while (select status from public.drafts where id = (select d5 from t5)) = 'live' loop
    v_guard := v_guard + 1;
    exit when v_guard > 12;
    perform tests.sell_open_role((select d5 from t5));
  end loop;
end $$;

create temporary table swap_forced as
  select id, role, team_id from public.players
   where draft_id = (select d5 from t5) and auto_assigned_from_lot_id is not null
   limit 1;

create temporary table swap_partner as
  select id from public.players
   where draft_id = (select d5 from t5)
     and role = (select role from swap_forced)
     and team_id is not null
     and team_id <> (select team_id from swap_forced)
     and acquisition <> 'captain'
   limit 1;

select tests.acting_as(tests.admin_id());
select lives_ok(
  $$select public.swap_roster_players(
    (select id from swap_forced), (select id from swap_partner)
  )$$,
  'admin swaps the cascaded player with a same-role player on another team'
);

select is(
  (select auto_assigned_from_lot_id from public.players where id = (select id from swap_forced)),
  null,
  'swapping clears the auto-assign stamp on the previously cascaded player'
);
select is(
  (select auto_assigned_from_lot_id from public.players where id = (select id from swap_partner)),
  null,
  'the other swapped player still has no stamp afterwards (regression guard)'
);

select * from finish();
rollback;
