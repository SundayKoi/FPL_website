-- Betting integration: pick'em, store, and seasons RPCs. Ported from
-- c:\fpl_gambling\db\migrations (010_pickem_cashout.sql [pick'em lifecycle;
-- cashout_bet/bets_notify_delete already ported by Task 3], 018_draws.sql
-- [latest create_pickem_admin, adds the draw-leg guard], 002_rpcs.sql
-- [purchase_item, renamed start_purchase per this task's interface],
-- 005_bot_rpcs.sql [fulfill_purchase/refund_purchase], 004_admin_rpcs.sql
-- [upsert_store_item_admin], 006_delete_rpcs.sql [delete_store_item_admin],
-- 011_seasons.sql [create_season_admin/close_season_admin]) with renames:
-- users -> betting_profiles, ledger -> betting_ledger, pickems ->
-- betting_pickems, pickem_legs -> betting_pickem_legs, pickem_cards ->
-- betting_pickem_cards, pickem_bank -> betting_pickem_bank, store_items ->
-- betting_store_items, purchases -> betting_purchases, seasons ->
-- betting_seasons, season_results -> betting_season_results, admin_audit ->
-- betting_admin_audit.
--
-- lock_due_pickems/pickem_near_misses/pickem_summary have no SQL source to
-- port — in c:\fpl_gambling they live as plain Python in bot/service.py
-- (lock_due_pickems: raw UPDATE...RETURNING; pickem_near_misses/
-- pickem_summary: raw SELECTs). Reimplemented here as SQL RPCs matching that
-- Python logic exactly, per this task's interface calling for "near-miss/
-- summary reads" and a lock step alongside the rest of the pick'em surface
-- (same reasoning as Task 3's lock_due_markets/void_one_sided_markets).
--
-- Controller ruling (per Task 3's precedent): the entire betting RPC surface
-- is service_role-only — see the lockdown block at the end. Authorization
-- lives in the app layer, not in these functions. Reuses `public._audit`
-- from 20260813000003_betting_market_rpcs.sql (no need to redefine).

-- === create_pickem_admin: latest version, 018_draws.sql (draw-leg guard) ===

create or replace function public.create_pickem_admin(
  p_actor text, p_event bigint, p_title text, p_markets bigint[]
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_lock timestamptz;
  v_n int;
  v_carry bigint;
begin
  if array_length(p_markets, 1) is null or array_length(p_markets, 1) < 2 then
    raise exception 'a pick-em needs at least 2 series';
  end if;
  if exists (select 1 from betting_markets where id = any(p_markets) and draw_enabled) then
    raise exception 'draw markets cannot be pick-em legs';
  end if;
  select min(lock_at), count(*) into v_lock, v_n
    from betting_markets where id = any(p_markets) and status = 'OPEN' and now() < lock_at;
  if v_n <> array_length(p_markets, 1) then
    raise exception 'all legs must be OPEN markets that have not locked';
  end if;

  -- claim the jackpot bank as this pick'em's carryover (lock, read, zero)
  select balance into v_carry from betting_pickem_bank where id = 1 for update;
  update betting_pickem_bank set balance = 0 where id = 1;

  insert into betting_pickems(event_id, title, carryover, lock_at, created_by)
    values (p_event, p_title, v_carry, v_lock, p_actor)
    returning id into v_id;
  insert into betting_pickem_legs(pickem_id, market_id)
    select v_id, unnest(p_markets);

  perform public._audit(p_actor, 'pickem_create', 'betting_pickems:' || v_id,
                 null, jsonb_build_object('title', p_title, 'legs', p_markets, 'carryover', v_carry));
  return v_id;
end;
$$;

-- === place_pickem_card: ported verbatim (table renames only) ================
-- Place (or replace, before lock) the caller's card.

create or replace function public.place_pickem_card(
  p_user text, p_pickem bigint, p_picks jsonb, p_amount bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_status text;
  v_lock timestamptz;
  v_legs int;
  v_valid int;
  v_old_id bigint;
  v_old_amount bigint;
  v_card bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select status, lock_at into v_status, v_lock from betting_pickems where id = p_pickem for update;
  if not found then raise exception 'unknown pick-em %', p_pickem; end if;
  if v_status <> 'OPEN' or now() >= v_lock then
    raise exception 'pick-em is locked';
  end if;

  -- picks must cover exactly the legs, each choosing one of that market's teams
  select count(*) into v_legs from betting_pickem_legs where pickem_id = p_pickem;
  select count(*) into v_valid
    from betting_pickem_legs l
    join betting_markets m on m.id = l.market_id
    where l.pickem_id = p_pickem
      and (p_picks ->> l.market_id::text)::bigint in (m.team_a_id, m.team_b_id);
  if v_valid <> v_legs or (select count(*) from jsonb_object_keys(p_picks)) <> v_legs then
    raise exception 'picks must choose a team for every series';
  end if;

  -- replacing an existing card refunds the old stake first
  select id, amount into v_old_id, v_old_amount
    from betting_pickem_cards where pickem_id = p_pickem and discord_id = p_user;
  if v_old_id is not null then
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_old_amount, 'pickem_refund', 'betting_pickem_cards', v_old_id);
    update betting_profiles set balance = balance + v_old_amount where discord_id = p_user
      returning balance into v_balance;
    delete from betting_pickem_cards where id = v_old_id;
  end if;

  if v_balance < p_amount then raise exception 'insufficient balance'; end if;

  insert into betting_pickem_cards(pickem_id, discord_id, amount, picks)
    values (p_pickem, p_user, p_amount, p_picks)
    returning id into v_card;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_amount, 'pickem_place', 'betting_pickem_cards', v_card);
  update betting_profiles set balance = balance - p_amount where discord_id = p_user
    returning balance into v_balance;
  return v_balance;
end;
$$;

-- === resolve_pickem: ported verbatim (table renames only) ===================
-- Resolve once every leg is RESOLVED or CANCELLED. Idempotent. Perfect cards
-- (all non-void legs right) split stakes+carryover pro-rata; no perfect card
-- => everything rolls into the bank for the next pick'em.

create or replace function public.resolve_pickem(p_pickem bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_carry bigint;
  v_pending int;
  v_live int;
  v_pool bigint;
  v_winner_stake bigint;
  r record;
  v_payout bigint;
begin
  select status, carryover into v_status, v_carry from betting_pickems where id = p_pickem for update;
  if not found then raise exception 'unknown pick-em %', p_pickem; end if;
  if v_status in ('RESOLVED', 'CANCELLED') then return; end if;

  select count(*) filter (where m.status not in ('RESOLVED','CANCELLED')),
         count(*) filter (where m.status = 'RESOLVED')
    into v_pending, v_live
    from betting_pickem_legs l join betting_markets m on m.id = l.market_id
    where l.pickem_id = p_pickem;
  if v_pending > 0 then
    raise exception 'pick-em has unresolved series';
  end if;

  -- every leg cancelled: void the night, refund cards, return carryover
  if v_live = 0 then
    for r in select id, discord_id, amount from betting_pickem_cards where pickem_id = p_pickem loop
      insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
        values (r.discord_id, r.amount, 'pickem_refund', 'betting_pickem_cards', r.id);
      update betting_profiles set balance = balance + r.amount where discord_id = r.discord_id;
      update betting_pickem_cards set payout = r.amount, correct = 0, settled = true where id = r.id;
    end loop;
    update betting_pickem_bank set balance = balance + v_carry where id = 1;
    update betting_pickems set status='CANCELLED', resolved_at = now() where id = p_pickem;
    return;
  end if;

  -- grade every card over the non-void legs
  update betting_pickem_cards c
     set correct = (
       select count(*)
       from betting_pickem_legs l join betting_markets m on m.id = l.market_id
       where l.pickem_id = p_pickem and m.status = 'RESOLVED'
         and (c.picks ->> l.market_id::text)::bigint = m.winning_team_id
     )
   where c.pickem_id = p_pickem;

  select coalesce(sum(amount), 0) + v_carry into v_pool
    from betting_pickem_cards where pickem_id = p_pickem;
  select coalesce(sum(amount), 0) into v_winner_stake
    from betting_pickem_cards where pickem_id = p_pickem and correct = v_live;

  if v_winner_stake > 0 then
    for r in select id, discord_id, amount from betting_pickem_cards
             where pickem_id = p_pickem and correct = v_live loop
      v_payout := (r.amount * v_pool) / v_winner_stake;  -- floored; dust burns
      insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
        values (r.discord_id, v_payout, 'pickem_payout', 'betting_pickem_cards', r.id);
      update betting_profiles set balance = balance + v_payout where discord_id = r.discord_id;
      update betting_pickem_cards set payout = v_payout, settled = true where id = r.id;
    end loop;
    update betting_pickem_cards set payout = 0, settled = true
      where pickem_id = p_pickem and correct <> v_live;
  else
    -- jackpot: the whole pool (stakes + carryover) rolls to the bank
    update betting_pickem_cards set payout = 0, settled = true where pickem_id = p_pickem;
    update betting_pickem_bank set balance = balance + v_pool where id = 1;
  end if;

  update betting_pickems set status='RESOLVED', resolved_at = now() where id = p_pickem;
end;
$$;

-- === cancel_pickem_admin: ported verbatim (table renames only) ==============
-- Cancel before/while open: refund every card, return carryover to the bank.

create or replace function public.cancel_pickem_admin(p_actor text, p_pickem bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_carry bigint;
  r record;
begin
  select status, carryover into v_status, v_carry from betting_pickems where id = p_pickem for update;
  if not found then raise exception 'unknown pick-em %', p_pickem; end if;
  if v_status in ('RESOLVED', 'CANCELLED') then
    raise exception 'pick-em already settled';
  end if;
  for r in select id, discord_id, amount from betting_pickem_cards where pickem_id = p_pickem loop
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (r.discord_id, r.amount, 'pickem_refund', 'betting_pickem_cards', r.id);
    update betting_profiles set balance = balance + r.amount where discord_id = r.discord_id;
    update betting_pickem_cards set payout = r.amount, settled = true where id = r.id;
  end loop;
  update betting_pickem_bank set balance = balance + v_carry where id = 1;
  update betting_pickems set status='CANCELLED', resolved_at = now() where id = p_pickem;
  perform public._audit(p_actor, 'pickem_cancel', 'betting_pickems:' || p_pickem, null, null);
end;
$$;

-- === lock_due_pickems =========================================================
-- Source has no SQL function for this — bot/service.py's lock_due_pickems ran
-- the equivalent UPDATE directly from Python. Wrapped here as a SQL RPC, same
-- treatment as Task 3's lock_due_markets, for the (later-task) lifecycle loop.
-- Display only: place_pickem_card enforces lock_at server-side regardless.

create or replace function public.lock_due_pickems()
returns setof bigint
language sql
security definer
set search_path = public
as $$
  update betting_pickems set status = 'LOCKED'
    where status = 'OPEN' and now() >= lock_at
    returning id;
$$;

-- === pickem_near_misses ========================================================
-- Source lives as bot/service.py's pickem_near_misses (plain SELECT).
-- Reimplemented as a SQL RPC: usernames who missed a perfect card by exactly
-- one leg — for the "so close" announcement callout. Only meaningful once
-- there were >= 2 live (non-void) legs to miss.

create or replace function public.pickem_near_misses(p_pickem bigint)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select count(*) filter (where m.status = 'RESOLVED') as n
    from betting_pickem_legs l join betting_markets m on m.id = l.market_id
    where l.pickem_id = p_pickem)
  select coalesce(u.username, c.discord_id)
  from betting_pickem_cards c
  join betting_profiles u on u.discord_id = c.discord_id, live
  where c.pickem_id = p_pickem and live.n >= 2 and c.correct = live.n - 1
  order by c.amount desc limit 5;
$$;

-- === pickem_summary ============================================================
-- Source lives as bot/service.py's pickem_summary (plain SELECTs returning a
-- dict). Reimplemented as a SQL RPC returning the equivalent row: pool,
-- winner count, top card — for the resolve announcement.

create or replace function public.pickem_summary(p_pickem bigint)
returns table(pool bigint, winners bigint, top_username text, top_payout bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select coalesce(sum(amount), 0) from betting_pickem_cards where pickem_id = p_pickem)
      + (select carryover from betting_pickems where id = p_pickem),
    (select count(*) from betting_pickem_cards
       where pickem_id = p_pickem and payout > 0 and correct is not null),
    (select coalesce(u.username, c.discord_id) from betting_pickem_cards c
       join betting_profiles u on u.discord_id = c.discord_id
       where c.pickem_id = p_pickem and c.payout > 0 order by c.payout desc limit 1),
    (select c.payout from betting_pickem_cards c
       where c.pickem_id = p_pickem and c.payout > 0 order by c.payout desc limit 1);
$$;

-- === start_purchase: 002_rpcs.sql's purchase_item, renamed per this task's ===
-- interface (`start_purchase(p_user text, p_item bigint)`). Ledger reason
-- kept verbatim from the source ('store').

create or replace function public.start_purchase(p_user text, p_item bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_cost bigint;
  v_active boolean;
  v_purchase_id bigint;
begin
  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  select cost, active into v_cost, v_active from betting_store_items where id = p_item;
  if not found then raise exception 'unknown item %', p_item; end if;
  if not v_active then raise exception 'item % inactive', p_item; end if;
  if v_balance < v_cost then raise exception 'insufficient balance'; end if;

  insert into betting_purchases(discord_id, item_id, cost) values (p_user, p_item, v_cost)
    returning id into v_purchase_id;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -v_cost, 'store', 'betting_purchases', v_purchase_id);
  update betting_profiles set balance = balance - v_cost where discord_id = p_user;

  return v_purchase_id;
end;
$$;

-- === fulfill_purchase: 005_bot_rpcs.sql, ported verbatim (table renames) ====
-- Mark a purchase fulfilled (the bot granted the Discord role). Idempotent:
-- fulfilling twice is a no-op. Refunded purchases cannot be fulfilled.

create or replace function public.fulfill_purchase(p_purchase bigint, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfilled boolean;
  v_ref text;
begin
  select fulfilled, fulfillment_ref into v_fulfilled, v_ref
    from betting_purchases where id = p_purchase for update;
  if not found then
    raise exception 'unknown purchase %', p_purchase;
  end if;
  if v_ref = 'refunded' then
    raise exception 'purchase % already refunded', p_purchase;
  end if;
  if v_fulfilled then
    return; -- idempotent
  end if;
  update betting_purchases set fulfilled = true, fulfillment_ref = p_ref where id = p_purchase;
end;
$$;

-- === refund_purchase: 005_bot_rpcs.sql, ported verbatim (table renames) =====
-- Refund an unfulfilled purchase (e.g. the role grant failed) so the user is
-- never charged for an item they did not receive. Idempotent; refuses to
-- refund a fulfilled purchase. Ledger reason kept verbatim from the source
-- ('refund' — the same reason Task 3's bet refunds use; the source reuses it
-- for both money movements).

create or replace function public.refund_purchase(p_purchase bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text;
  v_cost bigint;
  v_fulfilled boolean;
  v_ref text;
  v_balance bigint;
begin
  select discord_id, cost, fulfilled, fulfillment_ref
    into v_user, v_cost, v_fulfilled, v_ref
    from betting_purchases where id = p_purchase for update;
  if not found then
    raise exception 'unknown purchase %', p_purchase;
  end if;
  if v_fulfilled then
    raise exception 'purchase % already fulfilled', p_purchase;
  end if;
  if v_ref = 'refunded' then
    select balance into v_balance from betting_profiles where discord_id = v_user;
    return v_balance; -- idempotent
  end if;

  -- serialize per user, then reverse the charge
  select balance into v_balance from betting_profiles where discord_id = v_user for update;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (v_user, v_cost, 'refund', 'betting_purchases', p_purchase);
  update betting_profiles set balance = balance + v_cost where discord_id = v_user
    returning balance into v_balance;
  update betting_purchases set fulfillment_ref = 'refunded' where id = p_purchase;
  return v_balance;
end;
$$;

-- === upsert_store_item_admin: 004_admin_rpcs.sql, ported (table renames) ====

create or replace function public.upsert_store_item_admin(
  p_actor text, p_id bigint, p_name text, p_description text, p_cost bigint,
  p_type text, p_payload jsonb, p_active boolean
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if p_id is null then
    insert into betting_store_items(name, description, cost, type, payload, active)
      values (p_name, p_description, p_cost, p_type, coalesce(p_payload, '{}'::jsonb), p_active)
      returning id into v_id;
  else
    update betting_store_items set name = p_name, description = p_description, cost = p_cost,
                           type = p_type, payload = coalesce(p_payload, payload), active = p_active
      where id = p_id returning id into v_id;
    if v_id is null then raise exception 'unknown store item %', p_id; end if;
  end if;
  perform public._audit(p_actor, 'store_upsert', 'betting_store_items:' || v_id, null,
                 jsonb_build_object('name', p_name, 'cost', p_cost));
  return v_id;
end;
$$;

-- === delete_store_item_admin: 006_delete_rpcs.sql, ported (table renames) ===

create or replace function public.delete_store_item_admin(p_actor text, p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_refs int;
begin
  select name into v_name from betting_store_items where id = p_id for update;
  if not found then raise exception 'unknown store item %', p_id; end if;
  select count(*) into v_refs from betting_purchases where item_id = p_id;
  if v_refs > 0 then
    raise exception 'item has % purchase(s) — deactivate it instead', v_refs;
  end if;
  delete from betting_store_items where id = p_id;
  perform public._audit(p_actor, 'store_delete', 'betting_store_items:' || p_id,
                 jsonb_build_object('name', v_name), null);
end;
$$;

-- === create_season_admin: 011_seasons.sql, ported verbatim (table renames) ==

create or replace function public.create_season_admin(p_actor text, p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if exists (select 1 from betting_seasons where status = 'ACTIVE') then
    raise exception 'a season is already active — close it first';
  end if;
  insert into betting_seasons(name, created_by) values (p_name, p_actor) returning id into v_id;
  perform public._audit(p_actor, 'season_create', 'betting_seasons:' || v_id, null,
                 jsonb_build_object('name', p_name));
  return v_id;
end;
$$;

-- === close_season_admin: 011_seasons.sql, ported verbatim (table renames) ===
-- Close the active season: snapshot the top standings, and if p_reset_to > 0
-- soft-reset every wallet to that balance (one ledger row each, reason
-- 'season_reset'). Refuses while any market or pick'em is still unsettled so
-- a reset can't strand in-flight stakes. Idempotent per season.

create or replace function public.close_season_admin(
  p_actor text, p_season bigint, p_reset_to bigint, p_top int default 10
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  r record;
  v_rank int := 0;
  v_delta bigint;
begin
  select status into v_status from betting_seasons where id = p_season for update;
  if not found then raise exception 'unknown season %', p_season; end if;
  if v_status = 'CLOSED' then return; end if;  -- idempotent

  if exists (select 1 from betting_markets where status in ('OPEN','LOCKED')) then
    raise exception 'close all markets before ending the season';
  end if;
  if exists (select 1 from betting_pickems where status in ('OPEN','LOCKED')) then
    raise exception 'resolve all pick-ems before ending the season';
  end if;

  -- snapshot the top standings by balance
  for r in select discord_id, username, balance from betting_profiles
           order by balance desc, discord_id limit p_top loop
    v_rank := v_rank + 1;
    insert into betting_season_results(season_id, rank, discord_id, username, balance)
      values (p_season, v_rank, r.discord_id, r.username, r.balance);
  end loop;

  -- optional soft reset, through the ledger to keep the invariant intact
  if p_reset_to > 0 then
    for r in select discord_id, balance from betting_profiles for update loop
      v_delta := p_reset_to - r.balance;
      if v_delta <> 0 then
        insert into betting_ledger(discord_id, delta, reason)
          values (r.discord_id, v_delta, 'season_reset');
        update betting_profiles set balance = p_reset_to where discord_id = r.discord_id;
      end if;
    end loop;
  end if;

  update betting_seasons set status='CLOSED', closed_at = now() where id = p_season;
  perform public._audit(p_actor, 'season_close', 'betting_seasons:' || p_season, null,
                 jsonb_build_object('reset_to', p_reset_to));
end;
$$;

-- === lockdown: entire betting RPC surface is service_role-only ==============
-- Same controller ruling as 20260813000003_betting_market_rpcs.sql: every
-- function below moves money, writes pick'em/store/season state, or writes
-- an audit row, and none of them check who is calling. Authorization lives
-- in the app layer (server actions / the Discord interactions endpoint),
-- which authenticates the caller and derives their Discord ID server-side
-- before invoking the RPC with the service_role key; PostgREST must never
-- let anon/authenticated reach any of them directly. Reads stay on the RLS
-- select policies from 20260813000001_betting_schema.sql (betting_pickems/
-- betting_pickem_cards/betting_pickem_bank/betting_store_items/
-- betting_seasons/betting_season_results are still publicly readable).

revoke execute on function
  public.create_pickem_admin(text, bigint, text, bigint[]),
  public.place_pickem_card(text, bigint, jsonb, bigint),
  public.resolve_pickem(bigint),
  public.cancel_pickem_admin(text, bigint),
  public.lock_due_pickems(),
  public.pickem_near_misses(bigint),
  public.pickem_summary(bigint),
  public.start_purchase(text, bigint),
  public.fulfill_purchase(bigint, text),
  public.refund_purchase(bigint),
  public.upsert_store_item_admin(text, bigint, text, text, bigint, text, jsonb, boolean),
  public.delete_store_item_admin(text, bigint),
  public.create_season_admin(text, text),
  public.close_season_admin(text, bigint, bigint, int)
from public, anon, authenticated;

grant execute on function
  public.create_pickem_admin(text, bigint, text, bigint[]),
  public.place_pickem_card(text, bigint, jsonb, bigint),
  public.resolve_pickem(bigint),
  public.cancel_pickem_admin(text, bigint),
  public.lock_due_pickems(),
  public.pickem_near_misses(bigint),
  public.pickem_summary(bigint),
  public.start_purchase(text, bigint),
  public.fulfill_purchase(bigint, text),
  public.refund_purchase(bigint),
  public.upsert_store_item_admin(text, bigint, text, text, bigint, text, jsonb, boolean),
  public.delete_store_item_admin(text, bigint),
  public.create_season_admin(text, text),
  public.close_season_admin(text, bigint, bigint, int)
to service_role;
