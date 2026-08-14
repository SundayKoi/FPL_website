begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

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

select * from finish();
rollback;
