-- A floor under every stake: 250 betting dollars, for everyone.
--
-- Both ways into the pools get the same check, so there is no cheap seat
-- left over:
--
--   1. place_bet — a market bet, from the web bet panel or the Discord
--      stake modal. Each bet stands on its own; the floor is per bet, not
--      per market, so three 250s are fine and a 100 top-up is not.
--   2. place_pickem_card — a pick'em card, including a replacement card
--      (the refund of the old stake happens after this check, so a card
--      can never be replaced down to a token amount).
--
-- The floor is the amount asked for, checked before the wallet is read:
-- someone holding less than 250 gets 'insufficient balance' as they always
-- did, and nobody gets a smaller stake in by being poor.
--
-- Bets and cards already in the books are untouched — this only gates new
-- ones. Both functions are redeclared exactly as
-- 20260813000003_betting_market_rpcs.sql and
-- 20260813000004_betting_pickem_store_seasons.sql left them apart from the
-- added check; `create or replace` keeps their existing grants
-- (service_role only). The literal is mirrored in src/lib/betting/stakes.ts
-- (MIN_STAKE) for the UI copy and the pre-flight checks — change the two
-- together.

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
  if p_amount < 250 then
    raise exception 'minimum stake is %', 250;
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
  if p_amount < 250 then raise exception 'minimum stake is %', 250; end if;

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
