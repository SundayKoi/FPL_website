-- Two ways a card leaves your shelf: dust it for betting dollars, or trade
-- it to another collector.
--
-- Dusting is the floor under duplicates — a copy you'll never field turns
-- back into money at the rates in src/lib/packs/config.ts (deliberately well
-- under a pack's price, so shredding packs is a loss, not a loop). Trading
-- is the other half: cards and dollars move between two wallets in one
-- transaction, or neither moves.
--
-- Money invariant (20260813000001_betting_schema.sql): every balance change
-- writes a betting_ledger row, so ledger_drift() stays at zero. Both RPCs
-- below follow the house shape (20260826000015_card_packs_fantasy.sql): lock
-- the row FOR UPDATE, guard, write the ledger row, then move the balance.
-- accept_card_trade moves two wallets, so it takes them in least/greatest
-- order exactly like tip_points (20260813000002_betting_wallet_rpcs.sql) —
-- two people accepting each other's offers at the same moment must not
-- deadlock.
--
-- Authorization lives in the app layer, same controller ruling as the rest
-- of the betting surface: these functions check ownership of the *cards*
-- (they have to — a trade is only valid if both sides still hold what they
-- promised) but never verify that the caller is who they say they are. So
-- PostgREST must not expose them to anon/authenticated (lockdown at the
-- bottom); server actions derive the Discord id from the session and call
-- through the service-role client (src/lib/betting/service-client.ts).

-- === dust_card ===============================================================
-- Sell one owned copy back for betting dollars.
--
-- p_value is passed in rather than computed here for the same reason
-- open_card_pack takes p_cost: the rate table lives in
-- src/lib/packs/config.ts (dustValueOf), not in Postgres. That makes the
-- value untrusted input, hence the range guard — a bug or a forged call
-- can't mint an arbitrary balance, it can at most misprice one card inside a
-- sane band.
--
-- Destroying the row before crediting is intentional and the order matters:
-- the row is locked FOR UPDATE first, so two concurrent dusts of the same
-- copy serialize and the second finds nothing to delete.

create or replace function public.dust_card(p_user text, p_inventory bigint, p_value bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   text;
  v_balance bigint;
begin
  if p_value < 1 or p_value > 10000 then raise exception 'invalid dust value'; end if;

  select discord_id into v_owner from card_inventory where id = p_inventory for update;
  if not found then raise exception 'unknown card %', p_inventory; end if;
  if v_owner <> p_user then raise exception 'card not owned'; end if;

  delete from card_inventory where id = p_inventory;

  -- ref_id points at a row that no longer exists, on purpose: the ledger is
  -- a history, and "inventory 412 was dusted" stays true after the copy is
  -- gone. Same reasoning as a settled bet's ref.
  perform 1 from betting_profiles where discord_id = p_user for update;
  insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, p_value, 'card_dust', 'card_inventory', p_inventory);
  update betting_profiles set balance = balance + p_value where discord_id = p_user
    returning balance into v_balance;

  return v_balance;
end;
$$;

-- === card_trades =============================================================
-- One offer, from one collector to another: some of my cards plus some of my
-- dollars, for some of yours. Either side may be empty (a gift, or a
-- straight purchase) but the whole offer may not be — the check below is
-- what stops an empty trade from being a valid thing to accept.
--
-- The inventory ids are bigint[] rather than a join table because an offer
-- is a snapshot of an intent, not a claim on the cards: nothing is escrowed,
-- the ids are re-validated at accept time, and an offer whose cards have
-- since been dusted simply fails as stale. A join table would imply a
-- foreign-key hold that this design deliberately doesn't take.
--
-- Service-role only, like card_inventory: RLS on, no policies at all. The
-- app reads these through the service client after checking who is asking.
create table if not exists public.card_trades (
  id                     bigint generated always as identity primary key,
  season                 text not null,
  from_discord           text not null references public.betting_profiles(discord_id),
  to_discord             text not null references public.betting_profiles(discord_id),
  offered_inventory_ids  bigint[] not null default '{}',
  requested_inventory_ids bigint[] not null default '{}',
  offered_dollars        bigint not null default 0 check (offered_dollars >= 0),
  requested_dollars      bigint not null default 0 check (requested_dollars >= 0),
  status                 text not null default 'pending'
                           check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at             timestamptz not null default now(),
  decided_at             timestamptz,
  check (to_discord <> from_discord),
  check (
    array_length(offered_inventory_ids, 1) is not null
    or offered_dollars > 0
    or array_length(requested_inventory_ids, 1) is not null
    or requested_dollars > 0
  )
);

create index if not exists card_trades_to_idx on public.card_trades (to_discord, season, status);
create index if not exists card_trades_from_idx on public.card_trades (from_discord, season, status);

alter table public.card_trades enable row level security;

grant all on public.card_trades to service_role;

-- === accept_card_trade =======================================================
-- Execute a pending offer: cards change hands, dollars net out, both in one
-- transaction.
--
-- Nothing is escrowed when an offer is created, so every promise in it is
-- re-checked here against the live inventory. A card that has since been
-- dusted, traded away, or (impossibly, but cheaply guarded) moved to another
-- season fails the whole trade as 'trade is stale' rather than executing a
-- partial swap. The re-check locks every inventory row FOR UPDATE, which is
-- also what serializes two accepts that both want the same card.
--
-- Dollars net rather than crossing twice: an offer of "$500 for your card,
-- and I'll also take $200 back" is one $300 payment, one pair of ledger
-- rows. v_net > 0 means the offering side pays.

create or replace function public.accept_card_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade   card_trades%rowtype;
  v_net     bigint;
  v_payer   text;
  v_payee   text;
  v_first   text;
  v_second  text;
  v_balance bigint;
begin
  select * into v_trade from card_trades where id = p_trade for update;
  if not found then raise exception 'unknown trade %', p_trade; end if;
  if v_trade.status <> 'pending' then raise exception 'trade is not pending'; end if;
  if v_trade.to_discord <> p_user then raise exception 'trade is not yours to accept'; end if;

  -- Lock every copy the trade names before looking at any of it. One
  -- statement in id order so two trades over overlapping cards queue up
  -- instead of deadlocking, and a locking clause can't ride an aggregate
  -- anyway — the validations below are plain reads of rows already held.
  perform 1 from card_inventory
    where id = any(v_trade.offered_inventory_ids || v_trade.requested_inventory_ids)
    order by id
    for update;

  -- Every offered card must still be the offerer's, every requested card
  -- still the accepter's, and all of them in the trade's season. Checked
  -- per id rather than by counting matches so a dusted copy (no row at all)
  -- and a copy that changed hands both land in the same branch.
  if exists (
    select 1 from unnest(v_trade.offered_inventory_ids) as wanted(id)
    where not exists (
      select 1 from card_inventory
      where card_inventory.id = wanted.id
        and card_inventory.discord_id = v_trade.from_discord
        and card_inventory.season = v_trade.season
    )
  ) then
    raise exception 'trade is stale';
  end if;

  if exists (
    select 1 from unnest(v_trade.requested_inventory_ids) as wanted(id)
    where not exists (
      select 1 from card_inventory
      where card_inventory.id = wanted.id
        and card_inventory.discord_id = v_trade.to_discord
        and card_inventory.season = v_trade.season
    )
  ) then
    raise exception 'trade is stale';
  end if;

  v_net := v_trade.offered_dollars - v_trade.requested_dollars;

  -- Both wallets, in a stable order (deadlock-safe, same as tip_points) —
  -- taken even when v_net is zero, so a card-for-card swap still serializes
  -- against a concurrent dust by either party.
  v_first := least(v_trade.from_discord, v_trade.to_discord);
  v_second := greatest(v_trade.from_discord, v_trade.to_discord);
  perform 1 from betting_profiles where discord_id = v_first for update;
  perform 1 from betting_profiles where discord_id = v_second for update;

  if v_net <> 0 then
    if v_net > 0 then
      v_payer := v_trade.from_discord;
      v_payee := v_trade.to_discord;
    else
      v_payer := v_trade.to_discord;
      v_payee := v_trade.from_discord;
    end if;

    select balance into v_balance from betting_profiles where discord_id = v_payer;
    if v_balance is null then raise exception 'unknown user %', v_payer; end if;
    if v_balance < abs(v_net) then raise exception 'insufficient balance'; end if;

    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (v_payer, -abs(v_net), 'card_trade', 'card_trades', p_trade);
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (v_payee, abs(v_net), 'card_trade', 'card_trades', p_trade);
    update betting_profiles set balance = balance - abs(v_net) where discord_id = v_payer;
    update betting_profiles set balance = balance + abs(v_net) where discord_id = v_payee;
  end if;

  update card_inventory set discord_id = v_trade.to_discord
    where id = any(v_trade.offered_inventory_ids);
  update card_inventory set discord_id = v_trade.from_discord
    where id = any(v_trade.requested_inventory_ids);

  update card_trades set status = 'accepted', decided_at = now() where id = p_trade;
end;
$$;

-- === lockdown: service_role only =============================================
-- Both move money and neither authenticates its caller — same ruling as the
-- rest of the betting RPC surface
-- (20260813000004_betting_pickem_store_seasons.sql).

revoke execute on function
  public.dust_card(text, bigint, bigint),
  public.accept_card_trade(bigint, text)
from public, anon, authenticated;

grant execute on function
  public.dust_card(text, bigint, bigint),
  public.accept_card_trade(bigint, text)
to service_role;
