-- Showdown: Hold'em with the player cards, for betting dollars.
--
-- The shape, and why:
--
--   showdown_brackets   the stakes. Seeded from src/lib/showdown/config.ts
--                       and held to it by a test, so the RPCs can check a
--                       buy-in and a stack cap without trusting the app.
--   showdown_tables     one row per table: status, a version for the
--                       compare-and-swap every transition rides on, and
--                       public_state — the hand as EVERYONE may see it
--                       (board, pot, whose turn, who folded). Publicly
--                       readable and in the realtime publication: it is
--                       the feed the felt draws from.
--   showdown_secrets    what nobody may see: each seat's ten-card stack,
--                       hole cards, the rest of the deck. Deny-all. Never
--                       in the publication. The app builds a per-viewer
--                       snapshot from it that carries only your own cards.
--   showdown_seats      who sits where with how many chips. Chips at a
--                       table have LEFT the wallet (showdown_sit debits
--                       them, showdown_stand credits them back); the pot
--                       is inside public_state. Public.
--   showdown_seated_cards  the copies at a table, so the guard trigger on
--                       card_inventory can refuse to dust, list or trade
--                       one while it is seated — the expedition lock again.
--   showdown_hands      the history, one row per settled hand.
--   showdown_rake       what was burned. The rake never touches a wallet:
--                       it is chips that were already debited at sit-down
--                       and are never credited back.
--
-- The engine — dealing, betting, side pots, showdown — is TypeScript
-- (src/lib/showdown/engine.ts): a pure reducer over (public, secret)
-- state. Postgres holds the money, the version, and one invariant it can
-- check itself: chips never appear or vanish across a commit.
--
-- Only dollars are ever at stake. A card sits at a table; it is never
-- won, lost or put up.

-- === brackets ================================================================
create table if not exists public.showdown_brackets (
  key         text primary key,
  small_blind bigint not null check (small_blind > 0),
  big_blind   bigint not null check (big_blind >= small_blind),
  min_buy_in  bigint not null check (min_buy_in > 0),
  max_buy_in  bigint not null check (max_buy_in >= min_buy_in),
  stack_cap   int    not null check (stack_cap > 0)
);

insert into public.showdown_brackets (key, small_blind, big_blind, min_buy_in, max_buy_in, stack_cap) values
  ('low',  5,  10, 200,  1000, 650),
  ('open', 25, 50, 1000, 5000, 720)
on conflict (key) do update set
  small_blind = excluded.small_blind,
  big_blind   = excluded.big_blind,
  min_buy_in  = excluded.min_buy_in,
  max_buy_in  = excluded.max_buy_in,
  stack_cap   = excluded.stack_cap;

alter table public.showdown_brackets enable row level security;
drop policy if exists showdown_brackets_public_read on public.showdown_brackets;
create policy showdown_brackets_public_read on public.showdown_brackets for select using (true);
grant select on public.showdown_brackets to anon, authenticated;
grant all on public.showdown_brackets to service_role;

-- === tables ==================================================================
create table if not exists public.showdown_tables (
  id           bigint generated always as identity primary key,
  bracket      text not null references public.showdown_brackets(key),
  season       text not null,
  name         text not null,
  -- Set on a private table; the lobby lists only rows where it is null.
  code         text unique,
  status       text not null default 'waiting' check (status in ('waiting', 'hand', 'closed')),
  -- Bumped by every write. The engine reads a version, computes, and
  -- commits against it; a stale commit is refused and retried.
  version      bigint not null default 0,
  hand_no      int not null default 0,
  public_state jsonb not null default '{}'::jsonb,
  -- When the player to act runs out of clock. Any client may call the
  -- sweep once it has passed; the commit's version makes exactly one win.
  deadline_at  timestamptz,
  created_by   text references public.betting_profiles(discord_id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists showdown_tables_open on public.showdown_tables (bracket, created_at) where status <> 'closed';

alter table public.showdown_tables enable row level security;
drop policy if exists showdown_tables_public_read on public.showdown_tables;
create policy showdown_tables_public_read on public.showdown_tables for select using (true);
grant select on public.showdown_tables to anon, authenticated;
grant all on public.showdown_tables to service_role;

do $$ begin
  alter publication supabase_realtime add table public.showdown_tables;
exception
  when duplicate_object then null;
end $$;

-- === secrets =================================================================
create table if not exists public.showdown_secrets (
  table_id   bigint primary key references public.showdown_tables(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.showdown_secrets enable row level security;
grant all on public.showdown_secrets to service_role;

-- === seats ===================================================================
create table if not exists public.showdown_seats (
  id          bigint generated always as identity primary key,
  table_id    bigint not null references public.showdown_tables(id) on delete cascade,
  seat_no     int not null check (seat_no between 0 and 5),
  discord_id  text not null references public.betting_profiles(discord_id),
  chips       bigint not null check (chips >= 0),
  status      text not null default 'active' check (status in ('active', 'sitting_out', 'leaving')),
  house_stack boolean not null default false,
  timeouts    int not null default 0,
  joined_at   timestamptz not null default now(),
  unique (table_id, seat_no),
  -- One table at a time per person.
  unique (discord_id)
);

alter table public.showdown_seats enable row level security;
drop policy if exists showdown_seats_public_read on public.showdown_seats;
create policy showdown_seats_public_read on public.showdown_seats for select using (true);
grant select on public.showdown_seats to anon, authenticated;
grant all on public.showdown_seats to service_role;

do $$ begin
  alter publication supabase_realtime add table public.showdown_seats;
exception
  when duplicate_object then null;
end $$;

-- === seated cards, and the lock ============================================
create table if not exists public.showdown_seated_cards (
  -- No cascade from card_inventory on purpose: the guard below refuses the
  -- delete, so a seated copy cannot go anywhere.
  card_id    bigint primary key references public.card_inventory(id),
  table_id   bigint not null references public.showdown_tables(id) on delete cascade,
  discord_id text not null
);

create index if not exists showdown_seated_cards_table on public.showdown_seated_cards (table_id, discord_id);

alter table public.showdown_seated_cards enable row level security;
grant all on public.showdown_seated_cards to service_role;

-- Definer rights for the same reason expedition_guard has them: the lock
-- must hold whoever issues the delete or the owner change.
create or replace function public.showdown_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.showdown_seated_cards s where s.card_id = old.id) then
    raise exception 'card is at a table';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists card_inventory_showdown_guard on public.card_inventory;
create trigger card_inventory_showdown_guard
  before delete or update of discord_id on public.card_inventory
  for each row execute function public.showdown_seat_guard();

-- === history and the burn ====================================================
create table if not exists public.showdown_hands (
  id        bigint generated always as identity primary key,
  table_id  bigint not null references public.showdown_tables(id) on delete cascade,
  hand_no   int not null,
  season    text not null,
  bracket   text not null,
  played_at timestamptz not null default now(),
  pot       bigint not null check (pot >= 0),
  rake      bigint not null default 0 check (rake >= 0),
  -- Board, every seat's net for the hand, the winners and what they held.
  record    jsonb not null,
  unique (table_id, hand_no)
);

create index if not exists showdown_hands_week on public.showdown_hands (season, played_at desc);

alter table public.showdown_hands enable row level security;
grant all on public.showdown_hands to service_role;

create table if not exists public.showdown_rake (
  id         bigint generated always as identity primary key,
  table_id   bigint not null,
  hand_no    int not null,
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.showdown_rake enable row level security;
grant all on public.showdown_rake to service_role;

-- === showdown_sit ============================================================
-- Take a seat: check the stakes and the stack, move the buy-in out of the
-- wallet, seat the player, lock their cards. One transaction, so a refused
-- stack costs nothing and a debited buy-in always has a seat.

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
  if v_balance < p_buy_in then raise exception 'insufficient balance'; end if;

  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_buy_in, 'showdown_buy_in', 'showdown_tables', p_table);
  update betting_profiles set balance = balance - p_buy_in where discord_id = p_user;

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

grant execute on function public.showdown_sit(bigint, text, int, bigint, bigint[], boolean) to service_role;

-- === showdown_stand ==========================================================
-- Leave: chips back to the wallet, cards released, seat gone. Refused mid-
-- hand for a seat still in it — the engine folds a leaver first and marks
-- the seat sitting out, then this runs. Returns the new wallet balance.

create or replace function public.showdown_stand(p_table bigint, p_user text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table   showdown_tables%rowtype;
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
  if v_seat.chips > 0 then
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

grant execute on function public.showdown_stand(bigint, text) to service_role;

-- === showdown_commit =========================================================
-- The engine's one write. Compare-and-swap on the table version, then the
-- public state, the secret state, every seat's chips and status, the rake
-- burned and the hand's history row, all in one transaction.
--
-- The invariant Postgres checks itself: chips are conserved. What the
-- listed seats held before, plus the pot that was on the table, equals
-- what they hold after, plus the pot now, plus the rake burned. An engine
-- bug that mints or loses a chip is refused here rather than paid out.

create or replace function public.showdown_commit(
  p_table    bigint,
  p_version  bigint,
  p_status   text,
  p_hand_no  int,
  p_public   jsonb,
  p_secret   jsonb,
  p_seats    jsonb,
  p_rake     bigint,
  p_hand     jsonb,
  p_deadline timestamptz
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table    showdown_tables%rowtype;
  v_before   bigint;
  v_after    bigint;
  v_pot_was  bigint;
  v_pot_now  bigint;
  v_version  bigint;
  r          record;
begin
  if p_rake < 0 then raise exception 'rake cannot be negative'; end if;

  select * into v_table from showdown_tables where id = p_table for update;
  if not found then raise exception 'unknown table %', p_table; end if;
  if v_table.version <> p_version then raise exception 'stale table version'; end if;

  select coalesce(sum(s.chips), 0) into v_before
    from showdown_seats s
    join jsonb_to_recordset(p_seats) as x(seat_no int) on x.seat_no = s.seat_no
   where s.table_id = p_table;
  select coalesce(sum(x.chips), 0) into v_after
    from jsonb_to_recordset(p_seats) as x(chips bigint);
  v_pot_was := coalesce((v_table.public_state -> 'hand' ->> 'pot')::bigint, 0);
  v_pot_now := coalesce((p_public -> 'hand' ->> 'pot')::bigint, 0);
  if v_before + v_pot_was <> v_after + v_pot_now + p_rake then
    raise exception 'chips do not balance: % + % before, % + % + % after',
      v_before, v_pot_was, v_after, v_pot_now, p_rake;
  end if;

  update showdown_tables
     set status = p_status,
         hand_no = p_hand_no,
         public_state = p_public,
         deadline_at = p_deadline,
         version = version + 1,
         updated_at = now()
   where id = p_table
   returning version into v_version;

  insert into showdown_secrets(table_id, state) values (p_table, p_secret)
    on conflict (table_id) do update set state = excluded.state, updated_at = now();

  for r in select * from jsonb_to_recordset(p_seats) as x(seat_no int, chips bigint, status text, timeouts int) loop
    update showdown_seats
       set chips = r.chips, status = r.status, timeouts = coalesce(r.timeouts, timeouts)
     where table_id = p_table and seat_no = r.seat_no;
    if not found then raise exception 'no seat % at table %', r.seat_no, p_table; end if;
  end loop;

  if p_rake > 0 then
    insert into showdown_rake(table_id, hand_no, amount) values (p_table, p_hand_no, p_rake);
  end if;

  if p_hand is not null then
    insert into showdown_hands(table_id, hand_no, season, bracket, pot, rake, record)
      values (p_table, p_hand_no, v_table.season, v_table.bracket,
              coalesce((p_hand ->> 'pot')::bigint, 0), p_rake, p_hand);
  end if;

  return v_version;
end;
$$;

grant execute on function public.showdown_commit(bigint, bigint, text, int, jsonb, jsonb, jsonb, bigint, jsonb, timestamptz) to service_role;
