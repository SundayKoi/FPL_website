-- Betting integration: markets engine RPCs. Ported from
-- c:\fpl_gambling\db\migrations (002_rpcs.sql, 004_admin_rpcs.sql,
-- 005_bot_rpcs.sql [lock_due_markets/void_one_sided_markets logic actually
-- lives in bot/service.py there, not SQL — reimplemented here as RPCs per
-- this task's interface], 006_delete_rpcs.sql, 013_lock_warn.sql,
-- 014_opening_line.sql, 010_pickem_cashout.sql [cashout_bet only — pick'em
-- RPCs are task 4's job], 018_draws.sql [latest place_bet/resolve_market/
-- create_market_admin/delete_market_admin]) with renames: users ->
-- betting_profiles, ledger -> betting_ledger, teams -> betting_teams,
-- markets -> betting_markets, bets -> betting_bets, admin_audit ->
-- betting_admin_audit, pickem_legs -> betting_pickem_legs.
--
-- resolve_market/cancel_market are not in this task's public RPC interface
-- (only their _admin wrappers, plus void_one_sided_markets, are) — ported as
-- `_resolve_market`/`_cancel_market` internal helpers, revoked from
-- PostgREST-callable roles at the end alongside `_audit`, matching the
-- `_`-prefixed-helper convention from 20260807000009_revoke_internal_fns.sql.
-- Audit target labels are updated to the renamed table prefixes
-- (e.g. 'betting_markets:' instead of source's 'markets:').

-- === _audit: ported verbatim (table rename only) ============================

create or replace function public._audit(
  p_actor text, p_action text, p_target text, p_before jsonb, p_after jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into betting_admin_audit(actor, action, target, before, after)
  values (p_actor, p_action, p_target, p_before, p_after);
$$;

-- === _resolve_market: latest version, 018_draws.sql =========================
-- p_winning_team = -1 means "the Draw won" (RPC-boundary sentinel only; see
-- 20260813000001_betting_schema.sql's header note on the schema's actual
-- storage: team_id null + is_draw true). Winning OUTCOME's pool (a team, or
-- the draw) splits the losing pool pro-rata, less rake; empty winning pool
-- voids + refunds every bet on the market.

create or replace function public._resolve_market(p_market bigint, p_winning_team bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_rake int;
  v_team_a bigint;
  v_team_b bigint;
  v_draw boolean;
  v_is_draw boolean := (p_winning_team = -1);
  v_pool_win bigint;
  v_pool_lose bigint;
  v_distributable bigint;
  r record;
  v_payout bigint;
begin
  select status, rake_bps, team_a_id, team_b_id, draw_enabled
    into v_status, v_rake, v_team_a, v_team_b, v_draw
    from betting_markets where id = p_market for update;
  if not found then raise exception 'unknown market %', p_market; end if;
  if v_status = 'RESOLVED' then return; end if;  -- idempotency guard
  if v_status = 'CANCELLED' then raise exception 'market % already cancelled', p_market; end if;

  if v_is_draw then
    if not v_draw then raise exception 'market % has no draw option', p_market; end if;
  elsif p_winning_team not in (v_team_a, v_team_b) then
    raise exception 'team % not in market %', p_winning_team, p_market;
  end if;

  -- draw bets have team_id = NULL, so use is_draw / coalesce to avoid NULL
  -- comparisons silently dropping draw stakes from the losing pool.
  select coalesce(sum(amount) filter (where
           case when v_is_draw then is_draw else (not is_draw and team_id = p_winning_team) end
         ), 0),
         coalesce(sum(amount) filter (where
           not (case when v_is_draw then is_draw else (not is_draw and team_id = p_winning_team) end)
         ), 0)
    into v_pool_win, v_pool_lose
    from betting_bets where market_id = p_market;

  -- nobody backed the winning outcome: void + refund every bet
  if v_pool_win = 0 then
    for r in select id, discord_id, amount from betting_bets where market_id = p_market loop
      insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
        values (r.discord_id, r.amount, 'refund', 'betting_bets', r.id);
      update betting_profiles set balance = balance + r.amount where discord_id = r.discord_id;
      update betting_bets set payout = r.amount, settled = true where id = r.id;
    end loop;
    update betting_markets set status = 'RESOLVED', resolved_at = now(),
                       drawn = v_is_draw,
                       winning_team_id = case when v_is_draw then null else p_winning_team end
      where id = p_market;
    return;
  end if;

  -- losing pool only is raked; winners always get stake back
  v_distributable := greatest(0, (v_pool_lose * (10000 - v_rake)) / 10000);

  -- winners: stake back + pro-rata share of distributable (floored => dust stays in pool)
  for r in select id, discord_id, amount from betting_bets
           where market_id = p_market
             and (case when v_is_draw then is_draw else (not is_draw and team_id = p_winning_team) end) loop
    v_payout := r.amount + (r.amount * v_distributable) / v_pool_win;
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (r.discord_id, v_payout, 'bet_payout', 'betting_bets', r.id);
    update betting_profiles set balance = balance + v_payout where discord_id = r.discord_id;
    update betting_bets set payout = v_payout, settled = true where id = r.id;
  end loop;

  -- losers: settled with payout 0
  update betting_bets set payout = 0, settled = true
    where market_id = p_market
      and not (case when v_is_draw then is_draw else (not is_draw and team_id = p_winning_team) end);

  update betting_markets set status = 'RESOLVED', resolved_at = now(),
                     drawn = v_is_draw,
                     winning_team_id = case when v_is_draw then null else p_winning_team end
    where id = p_market;
end;
$$;

-- === _cancel_market: ported verbatim (table rename only) ====================

create or replace function public._cancel_market(p_market bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  r record;
begin
  select status into v_status from betting_markets where id = p_market for update;
  if not found then raise exception 'unknown market %', p_market; end if;
  if v_status = 'CANCELLED' then return; end if;  -- idempotent
  if v_status = 'RESOLVED' then raise exception 'market % already resolved', p_market; end if;

  for r in select id, discord_id, amount from betting_bets where market_id = p_market and not settled loop
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (r.discord_id, r.amount, 'refund', 'betting_bets', r.id);
    update betting_profiles set balance = balance + r.amount where discord_id = r.discord_id;
    update betting_bets set payout = r.amount, settled = true where id = r.id;
  end loop;

  update betting_markets set status = 'CANCELLED', resolved_at = now() where id = p_market;
end;
$$;

-- === place_bet: latest version, 018_draws.sql ================================
-- p_team = -1 means "the Draw" (only valid when the market's draw_enabled).
-- Returns the bettor's new balance — a deliberate narrowing from the
-- source's jsonb {balance, pool_a, pool_b, pool_draw} return, per this
-- task's interface (`returns bigint`); callers read pools straight off
-- betting_bets/the realtime subscription instead.

create or replace function public.place_bet(
  p_user text, p_market bigint, p_team bigint, p_amount bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_status text;
  v_lock_at timestamptz;
  v_team_a bigint;
  v_team_b bigint;
  v_draw boolean;
  v_is_draw boolean := (p_team = -1);
  v_bet_id bigint;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- serialize per user
  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then
    raise exception 'unknown user %', p_user;
  end if;

  select status, lock_at, team_a_id, team_b_id, draw_enabled
    into v_status, v_lock_at, v_team_a, v_team_b, v_draw
    from betting_markets where id = p_market for share;
  if not found then
    raise exception 'unknown market %', p_market;
  end if;

  if v_status <> 'OPEN' then
    raise exception 'market % not open (status=%)', p_market, v_status;
  end if;
  if now() >= v_lock_at then
    raise exception 'market % locked', p_market;  -- SERVER-AUTHORITATIVE
  end if;
  if v_is_draw then
    if not v_draw then raise exception 'this market has no draw option'; end if;
  elsif p_team not in (v_team_a, v_team_b) then
    raise exception 'team % not in market %', p_team, p_market;
  end if;
  if v_balance < p_amount then
    raise exception 'insufficient balance';
  end if;

  insert into betting_bets(market_id, discord_id, team_id, amount, is_draw)
    values (p_market, p_user, case when v_is_draw then null else p_team end, p_amount, v_is_draw)
    returning id into v_bet_id;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_amount, 'bet_place', 'betting_bets', v_bet_id);
  update betting_profiles set balance = balance - p_amount where discord_id = p_user;

  return v_balance - p_amount;
end;
$$;

-- === cashout_bet: 010_pickem_cashout.sql, bet-facing part only ===============
-- The source trigger `bets_notify_delete`/`trg_bets_notify_delete` (a custom
-- pg_notify listener for the old bespoke bot) is not ported: this repo's
-- Supabase Realtime `postgres_changes` publication on betting_bets (added in
-- 20260813000001_betting_schema.sql) already carries DELETE events over the
-- WAL, no bespoke trigger needed.
-- pick'em RPCs (place_pickem_card, resolve_pickem, cancel_pickem_admin,
-- create_pickem_admin): task 4.

create or replace function public.cashout_bet(p_user text, p_bet bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market bigint;
  v_amount bigint;
  v_owner text;
  v_status text;
  v_lock timestamptz;
  v_refund bigint;
  v_balance bigint;
begin
  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select b.market_id, b.amount, b.discord_id, m.status, m.lock_at
    into v_market, v_amount, v_owner, v_status, v_lock
    from betting_bets b join betting_markets m on m.id = b.market_id
    where b.id = p_bet and not b.settled
    for update of b;
  if not found then raise exception 'unknown or settled bet %', p_bet; end if;
  if v_owner <> p_user then raise exception 'not your bet'; end if;
  if v_status <> 'OPEN' or now() >= v_lock then
    raise exception 'market is locked — no cashout';
  end if;

  v_refund := v_amount - ((v_amount * 500) / 10000);  -- 5% fee, burned (no house account)
  delete from betting_bets where id = p_bet;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_refund, 'cashout', 'betting_bets', p_bet);
  update betting_profiles set balance = balance + v_refund where discord_id = p_user
    returning balance into v_balance;
  return v_balance;
end;
$$;

-- === lock_due_markets =========================================================
-- Source has no SQL function for this — bot/service.py's lock_due_markets ran
-- the equivalent UPDATE directly from Python. Wrapped here as a SQL RPC per
-- this task's interface, for the (later-task) SQL-cron lifecycle loop.
-- Display only: place_bet enforces lock_at server-side regardless of status.

create or replace function public.lock_due_markets()
returns setof bigint
language sql
security definer
set search_path = public
as $$
  update betting_markets set status = 'LOCKED'
    where status = 'OPEN' and now() >= lock_at
    returning id;
$$;

-- === void_one_sided_markets ===================================================
-- Source logic lives in bot/service.py's void_one_sided_markets (Python,
-- calling the cancel_market RPC per id) — reimplemented here as a single SQL
-- RPC per this task's interface. A market that locked with every stake on a
-- single outcome (or no bets) is a no-contest; auto-cancel + refund at lock
-- time instead of leaving it stuck LOCKED. Self-heals already-stuck markets.

create or replace function public.void_one_sided_markets()
returns setof bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select m.id
    from betting_markets m
    where m.status in ('OPEN', 'LOCKED') and now() >= m.lock_at
      and (
        select count(*) from (
          select 1 from betting_bets b where b.market_id = m.id and not b.is_draw
            and b.team_id = m.team_a_id having coalesce(sum(b.amount), 0) > 0
          union all
          select 1 from betting_bets b where b.market_id = m.id and not b.is_draw
            and b.team_id = m.team_b_id having coalesce(sum(b.amount), 0) > 0
          union all
          select 1 from betting_bets b where b.market_id = m.id and b.is_draw
            having coalesce(sum(b.amount), 0) > 0
        ) sides
      ) < 2
  loop
    perform public._cancel_market(r.id);
    return next r.id;
  end loop;
  return;
end;
$$;

-- === resolve_market_admin: 004_admin_rpcs.sql, calls the renamed helper =====

create or replace function public.resolve_market_admin(p_actor text, p_market bigint, p_winner bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from betting_markets where id = p_market;
  perform public._audit(p_actor, 'market_resolve', 'betting_markets:' || p_market,
                 jsonb_build_object('status', v_status),
                 jsonb_build_object('status', 'RESOLVED', 'winner', p_winner));
  perform public._resolve_market(p_market, p_winner);
end;
$$;

-- === cancel_market_admin: 004_admin_rpcs.sql, calls the renamed helper ======

create or replace function public.cancel_market_admin(p_actor text, p_market bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from betting_markets where id = p_market;
  perform public._audit(p_actor, 'market_cancel', 'betting_markets:' || p_market,
                 jsonb_build_object('status', v_status), jsonb_build_object('status', 'CANCELLED'));
  perform public._cancel_market(p_market);
end;
$$;

-- === create_market_admin: latest version, 018_draws.sql (10 args) ===========

create or replace function public.create_market_admin(
  p_actor text, p_event bigint, p_team_a bigint, p_team_b bigint,
  p_title text, p_rules text, p_game_at timestamptz, p_rake_bps int,
  p_open_line_prob_a numeric default null, p_draw_enabled boolean default false
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  insert into betting_markets(event_id, team_a_id, team_b_id, title, rules, game_at, lock_at,
                      rake_bps, open_line_prob_a, draw_enabled, created_by)
    values (p_event, p_team_a, p_team_b, p_title, p_rules, p_game_at,
            p_game_at - interval '5 minutes', coalesce(p_rake_bps, 0),
            p_open_line_prob_a, coalesce(p_draw_enabled, false), p_actor)
    returning id into v_id;
  perform public._audit(p_actor, 'market_create', 'betting_markets:' || v_id, null,
                 jsonb_build_object('event', p_event, 'teams', jsonb_build_array(p_team_a, p_team_b),
                                    'draw', p_draw_enabled));
  return v_id;
end;
$$;

-- === delete_market_admin: latest version, 010_pickem_cashout.sql ============
-- (the pickem_legs guard — betting_pickem_legs already exists from Task 1's
-- schema migration; the pick'em RPCs that populate it are task 4's job).

create or replace function public.delete_market_admin(p_actor text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_refs int;
begin
  select coalesce(title, 'Market ' || id) into v_title from betting_markets where id = p_id for update;
  if not found then raise exception 'unknown market %', p_id; end if;
  select count(*) into v_refs from betting_bets where market_id = p_id;
  if v_refs > 0 then
    raise exception 'market has % bet(s) — cancel it instead', v_refs;
  end if;
  select count(*) into v_refs from betting_pickem_legs where market_id = p_id;
  if v_refs > 0 then
    raise exception 'market is a pick-em leg — cancel the pick-em first';
  end if;
  delete from betting_markets where id = p_id;
  perform public._audit(p_actor, 'market_delete', 'betting_markets:' || p_id,
                 jsonb_build_object('title', v_title), null);
end;
$$;

-- === revoke internal helpers ==================================================
-- Only the SECURITY DEFINER wrappers (place_bet, cashout_bet,
-- void_one_sided_markets, resolve_market_admin, cancel_market_admin,
-- create_market_admin, delete_market_admin) may reach these; they must not be
-- directly PostgREST-callable. Matches 20260807000009_revoke_internal_fns.sql.

revoke execute on function
  public._audit(text, text, text, jsonb, jsonb),
  public._resolve_market(bigint, bigint),
  public._cancel_market(bigint)
from public, anon, authenticated;
