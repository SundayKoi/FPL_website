-- Card-pack economy: buy a pack of player cards with betting dollars, keep
-- what you pull, and field a weekly fantasy lineup out of your collection.
--
-- The three tables here are the ledger-side foundation; the pack contents
-- themselves are rolled in JS (src/lib/packs/rng.ts) because cards are
-- computed at request time from season stats (src/lib/cards/queries.ts) and
-- have no table of their own to draw from. That split forces the
-- charge-then-fulfill shape the store already uses: open_card_pack debits
-- the wallet and returns an open id, the app inserts the pulled cards, and
-- refund_card_pack reverses the charge if the insert fails.
--
-- Money invariant (20260813000001_betting_schema.sql): every balance change
-- writes a betting_ledger row, so ledger_drift() stays at zero. All three
-- RPCs below follow start_purchase's shape
-- (20260813000004_betting_pickem_store_seasons.sql): lock the wallet row
-- FOR UPDATE, guard, insert the ref row, insert the ledger row, then move
-- the balance.
--
-- Authorization lives in the app layer, same controller ruling as the rest
-- of the betting surface: these functions never check who is calling, so
-- PostgREST must not expose them to anon/authenticated (lockdown at the
-- bottom). Server actions derive the Discord id from the session and call
-- through the service-role client (src/lib/betting/service-client.ts).

-- === tables ==================================================================

-- One row per pack purchase. Exists mainly so the ledger row has something
-- to point at (ref_table/ref_id) and so refund_card_pack can tell a charged
-- pack from a fulfilled one. Service-role only, like betting_purchases.
create table if not exists public.card_pack_opens (
  id         bigint generated always as identity primary key,
  discord_id text not null references public.betting_profiles(discord_id),
  season     text not null,
  cost       bigint not null,
  opened_at  timestamptz not null default now()
);

alter table public.card_pack_opens enable row level security;

grant all on public.card_pack_opens to service_role;

-- A user's owned cards. `card` stores the full PlayerCardData snapshot as it
-- was at pull time: ratings are recomputed nightly from live stats, and a
-- collectible that silently restats itself is not a collectible. The flat
-- columns beside it (overall, tier, role, slug…) are denormalized out of
-- that json purely so the collection can be filtered and sorted in SQL.
-- edition_week is the Monday of the pull week — the print run a copy belongs
-- to, same Monday-start week the homepage awards use.
create table if not exists public.card_inventory (
  id           bigint generated always as identity primary key,
  discord_id   text not null references public.betting_profiles(discord_id),
  season       text not null,
  slug         text not null,
  player_name  text not null,
  role         text not null,
  edition_week date not null,
  overall      int not null,
  tier         text not null,
  foil         boolean not null default false,
  card         jsonb not null,
  pack_open_id bigint references public.card_pack_opens(id),
  acquired_at  timestamptz not null default now()
);

create index if not exists card_inventory_owner_idx on public.card_inventory (discord_id, season);

alter table public.card_inventory enable row level security;

grant all on public.card_inventory to service_role;

-- A week's fantasy entry. Publicly readable because the leaderboard renders
-- for signed-out visitors (same reasoning as betting_pickem_cards); writes
-- are service-role only, so there is no insert/update policy at all.
-- `slots` holds the chosen card_inventory ids by lineup position, `score` /
-- `breakdown` / `paid_out` / `scored_at` stay null until the week is graded.
create table if not exists public.fantasy_lineups (
  discord_id    text not null references public.betting_profiles(discord_id),
  season        text not null,
  week_start    date not null,
  slots         jsonb not null,
  total_overall int not null,
  submitted_at  timestamptz not null default now(),
  score         numeric,
  breakdown     jsonb,
  paid_out      bigint,
  scored_at     timestamptz,
  primary key (discord_id, season, week_start)
);

alter table public.fantasy_lineups enable row level security;

create policy fantasy_lineups_public_read on public.fantasy_lineups
  for select using (true);

grant select on public.fantasy_lineups to anon, authenticated;
grant all on public.fantasy_lineups to service_role;

-- === open_card_pack ==========================================================
-- Charge for one pack and return the open id the caller fulfills against.
-- Shaped after start_purchase: the wallet row is locked FOR UPDATE first so
-- two concurrent opens can't both read the same balance and overdraw. The
-- cost is passed in rather than read from a table because packs have no
-- store row — src/lib/packs/config.ts is the single source of truth for the
-- price, which is why p_cost is guarded here instead of trusted.

create or replace function public.open_card_pack(p_user text, p_season text, p_cost bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_open_id bigint;
begin
  if p_cost <= 0 then raise exception 'cost must be positive'; end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_balance < p_cost then raise exception 'insufficient balance'; end if;

  insert into card_pack_opens(discord_id, season, cost) values (p_user, p_season, p_cost)
    returning id into v_open_id;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, -p_cost, 'card_pack', 'card_pack_opens', v_open_id);
  update betting_profiles set balance = balance - p_cost where discord_id = p_user;

  return v_open_id;
end;
$$;

-- === refund_card_pack ========================================================
-- Compensating transaction for open_card_pack: the app charges first, then
-- inserts the pulled cards, so a failed insert must hand the money back or
-- the user paid for an empty pack. Idempotent (the caller may retry a refund
-- whose response it never saw) and refuses to refund a pack that actually
-- delivered cards — the presence of card_inventory rows pointing at the open
-- is the fulfillment record, so there is no separate `fulfilled` flag to
-- race against.

create or replace function public.refund_card_pack(p_open bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text;
  v_cost bigint;
begin
  select discord_id, cost into v_user, v_cost from card_pack_opens where id = p_open for update;
  if not found then raise exception 'unknown pack open %', p_open; end if;

  if exists (select 1 from card_inventory where pack_open_id = p_open) then
    raise exception 'pack already fulfilled';
  end if;

  -- already refunded: the ledger row is the receipt, so re-running is a no-op
  if exists (
    select 1 from betting_ledger
    where reason = 'card_pack_refund' and ref_table = 'card_pack_opens' and ref_id = p_open
  ) then
    return;
  end if;

  -- serialize per user, then reverse the charge
  perform 1 from betting_profiles where discord_id = v_user for update;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (v_user, v_cost, 'card_pack_refund', 'card_pack_opens', p_open);
  update betting_profiles set balance = balance + v_cost where discord_id = v_user;
end;
$$;

-- === fantasy_payout ==========================================================
-- Credits one week's fantasy winnings.
--
-- IDEMPOTENCY IS THE CALLER'S JOB. fantasy_lineups is keyed by
-- (discord_id, season, week_start) — a composite key that does not fit
-- betting_ledger.ref_id (a bigint) — so this function cannot recognize a
-- replayed payout on its own and writes ref_id null. The contract the
-- scoring job must honor:
--
--   update fantasy_lineups set paid_out = <amt>, scored_at = now()
--     where discord_id = ... and season = ... and week_start = ...
--       and paid_out is null;
--   -- only if that UPDATE reported one affected row:
--   select fantasy_payout(<user>, <amt>, <season>, <week>);
--
-- The `paid_out is null` guard is what makes the pair exactly-once: a second
-- run's UPDATE matches nothing and the payout is skipped. Calling this
-- function without that claim step will double-pay — which is why p_season
-- and p_week are taken at all: the only thing this function can do to
-- defend the contract is refuse to pay when it cannot see the claim it was
-- supposed to follow.

create or replace function public.fantasy_payout(p_user text, p_amount bigint, p_season text, p_week date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- the caller's claim step must already have stamped paid_out; without it
  -- this is a replay (or a bug) and paying would be a double credit
  if not exists (
    select 1 from fantasy_lineups
    where discord_id = p_user and season = p_season and week_start = p_week and paid_out = p_amount
  ) then
    raise exception 'payout not claimed';
  end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, p_amount, 'fantasy_payout', 'fantasy_lineups', null);
  update betting_profiles set balance = balance + p_amount where discord_id = p_user;
end;
$$;

-- === lockdown: service_role only =============================================
-- All three move money and none of them check who is calling — same ruling
-- as the rest of the betting RPC surface
-- (20260813000004_betting_pickem_store_seasons.sql).

revoke execute on function
  public.open_card_pack(text, text, bigint),
  public.refund_card_pack(bigint),
  public.fantasy_payout(text, bigint, text, date)
from public, anon, authenticated;

grant execute on function
  public.open_card_pack(text, text, bigint),
  public.refund_card_pack(bigint),
  public.fantasy_payout(text, bigint, text, date)
to service_role;
