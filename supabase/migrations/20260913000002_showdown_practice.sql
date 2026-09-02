-- Showdown practice tables: play chips, nothing won or lost.
--
-- Until the game has been played for real by real people, every table
-- is free: a Practice bracket whose buy-in is the size of the stack in
-- front of you and touches no wallet in either direction, and whose pots
-- are not raked. The Low and Open brackets stay seeded and stay refused
-- by the lobby until PRACTICE_ONLY in src/lib/showdown/config.ts is
-- turned off; nothing in the database changes when it is.

alter table public.showdown_brackets add column if not exists free boolean not null default false;

insert into public.showdown_brackets (key, small_blind, big_blind, min_buy_in, max_buy_in, stack_cap, free) values
  ('free', 25, 50, 1000, 1000, 720, true),
  ('low',  5,  10, 200,  1000, 650, false),
  ('open', 25, 50, 1000, 5000, 720, false)
on conflict (key) do update set
  small_blind = excluded.small_blind,
  big_blind   = excluded.big_blind,
  min_buy_in  = excluded.min_buy_in,
  max_buy_in  = excluded.max_buy_in,
  stack_cap   = excluded.stack_cap,
  free        = excluded.free;

-- === showdown_sit, with the free door ========================================
create or replace function public.showdown_sit(
  p_table  bigint,
  p_user   text,
  p_seat   int,
  p_buy_in bigint,
  p_cards  bigint[],
  p_house  boolean
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table   showdown_tables%rowtype;
  v_bracket showdown_brackets%rowtype;
  v_balance bigint;
  v_owned   int;
  v_total   int;
  v_seat    bigint;
begin
  select * into v_table from showdown_tables where id = p_table for update;
  if not found then raise exception 'unknown table %', p_table; end if;
  if v_table.status = 'closed' then raise exception 'table is closed'; end if;

  select * into v_bracket from showdown_brackets where key = v_table.bracket;
  if p_buy_in < v_bracket.min_buy_in or p_buy_in > v_bracket.max_buy_in then
    raise exception 'buy-in must be between % and %', v_bracket.min_buy_in, v_bracket.max_buy_in;
  end if;

  if exists (select 1 from showdown_seats where table_id = p_table and seat_no = p_seat) then
    raise exception 'seat is taken';
  end if;
  if exists (select 1 from showdown_seats where discord_id = p_user) then
    raise exception 'already seated';
  end if;

  if p_house then
    if coalesce(array_length(p_cards, 1), 0) <> 0 then raise exception 'a house stack brings no cards'; end if;
  else
    if coalesce(array_length(p_cards, 1), 0) <> 10 then raise exception 'a stack is 10 cards'; end if;
    select count(distinct id), coalesce(sum(overall), 0)::int into v_owned, v_total
      from card_inventory where id = any(p_cards) and discord_id = p_user;
    if v_owned <> 10 then raise exception 'stack has cards you do not own'; end if;
    if v_total > v_bracket.stack_cap then
      raise exception 'stack totals % overall; the cap is %', v_total, v_bracket.stack_cap;
    end if;
    if exists (select 1 from showdown_seated_cards where card_id = any(p_cards)) then
      raise exception 'card is at a table';
    end if;
  end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  -- A practice table deals play chips: the buy-in is the size of the
  -- stack in front of you and nothing leaves the wallet.
  if not v_bracket.free then
    if v_balance < p_buy_in then raise exception 'insufficient balance'; end if;
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, -p_buy_in, 'showdown_buy_in', 'showdown_tables', p_table);
    update betting_profiles set balance = balance - p_buy_in where discord_id = p_user;
  end if;

  insert into showdown_seats(table_id, seat_no, discord_id, chips, house_stack)
    values (p_table, p_seat, p_user, p_buy_in, p_house)
    returning id into v_seat;

  if not p_house then
    insert into showdown_seated_cards(card_id, table_id, discord_id)
      select unnest(p_cards), p_table, p_user;
  end if;

  update showdown_tables set version = version + 1, updated_at = now() where id = p_table;
  return v_seat;
end;
$$;


-- === showdown_stand, with the free door ======================================
create or replace function public.showdown_stand(p_table bigint, p_user text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table   showdown_tables%rowtype;
  v_bracket showdown_brackets%rowtype;
  v_seat    showdown_seats%rowtype;
  v_balance bigint;
begin
  select * into v_table from showdown_tables where id = p_table for update;
  if not found then raise exception 'unknown table %', p_table; end if;

  select * into v_seat from showdown_seats where table_id = p_table and discord_id = p_user for update;
  if not found then raise exception 'not seated'; end if;
  if v_table.status = 'hand' and v_seat.status <> 'sitting_out' then
    raise exception 'hand in progress';
  end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  select * into v_bracket from showdown_brackets where key = v_table.bracket;
  -- Play chips at a practice table go nowhere.
  if v_seat.chips > 0 and not v_bracket.free then
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_seat.chips, 'showdown_cash_out', 'showdown_tables', p_table);
    update betting_profiles set balance = balance + v_seat.chips where discord_id = p_user;
    v_balance := v_balance + v_seat.chips;
  end if;

  delete from showdown_seated_cards where table_id = p_table and discord_id = p_user;
  delete from showdown_seats where id = v_seat.id;
  update showdown_tables set version = version + 1, updated_at = now() where id = p_table;
  return v_balance;
end;
$$;

