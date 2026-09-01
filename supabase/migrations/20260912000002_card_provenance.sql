-- ---------------------------------------------------------------------------
-- Provenance: where a copy came from, and everyone who has held it since.
--
-- A serial (20260912000001) says WHICH copy this is. This says WHOSE it has
-- been. Together they are the difference between a card and a collectible:
-- the second Eclipse ever minted, pulled by one person, traded twice, is a
-- different object from an identical row with no story attached — and the
-- story is only worth anything if nobody could have typed it in.
--
-- HISTORY OUTLIVES THE COPY. There is deliberately no foreign key to
-- card_inventory. dust_card DELETEs the row, and a chain that vanished the
-- moment somebody melted the card would be a chain that answers "who owned
-- this?" only while the answer is trivially available anyway. A 'dusted'
-- row whose inventory_id points at nothing is the whole point: it is the
-- record that the copy existed and then did not. Same ruling the betting
-- ledger already makes about a dusted copy's ref_id — "inventory 412 was
-- dusted" stays true after 412 is gone.
--
-- WRITTEN BY TRIGGERS, NOT BY CALLERS. Every path a copy can move by is a
-- write to card_inventory: the pack opener inserts, accept_card_trade
-- updates discord_id, dust_card deletes, and whatever gets written next
-- year will do one of those three or it will not have moved a card. Hanging
-- the history off the table itself means a new transfer path is recorded
-- correctly the day it ships, by a developer who has never heard of this
-- file. A history that each caller had to remember to append to would be a
-- history with holes in exactly the places somebody was in a hurry.
--
-- THE REF, AND WHY IT ARRIVES THROUGH A GUC. A row change carries no
-- context: the UPDATE that moves discord_id looks identical whether it came
-- from a trade, a sale, or an admin fixing a typo, and a trigger cannot see
-- its caller's intent. So the caller states it, in the transaction, before
-- the write:
--
--     perform set_config('fpl.provenance_ref', 'card_trades:' || p_trade, true);
--
-- The value is 'table:id'. `true` makes it transaction-local, so it cannot
-- leak into the next statement on a pooled connection, and an unset GUC
-- simply produces a transfer with no ref rather than an error — an
-- unattributed transfer is still a true transfer. THIS IS A CONTRACT, not
-- an implementation detail: any future RPC that moves a copy (a marketplace
-- sale, a gift command) should set it the same way immediately before its
-- UPDATE, and is documented as such in docs/backend.md.
--
-- The 'minted' ref does not use the GUC: an insert already carries its
-- source on the row itself (pack_open_id), and a fact stored on the row
-- beats a fact the caller had to remember to announce.
-- ---------------------------------------------------------------------------

-- === The chain ==============================================================
-- One row per thing that happened to a copy. `from`/`to` are nullable
-- because a mint has no sender and a dust has no recipient — the shape of
-- the row says which event it is even without reading `event`.
create table if not exists public.card_provenance (
  id           bigint generated always as identity primary key,
  -- No FK, on purpose. See the header.
  inventory_id bigint not null,
  event        text   not null check (event in ('minted', 'transferred', 'dusted')),
  from_discord text,
  to_discord   text,
  ref_table    text,
  ref_id       bigint,
  at           timestamptz not null default now()
);

-- The only read this table serves: one copy's history, oldest first.
create index if not exists card_provenance_copy_idx
  on public.card_provenance (inventory_id, at);

comment on table public.card_provenance is
  'Ownership history of card_inventory copies. Trigger-written; survives the copy''s deletion (no FK).';

-- === The recorder ===========================================================
-- One function, three triggers: the events differ only in which side of the
-- move is known, and splitting that into three near-identical bodies is how
-- two of them drift.
--
-- security definer with a pinned search_path for expedition_guard's reason
-- (20260901000001): the history has to be written whoever issues the write,
-- and a definer that resolves `card_provenance` through the caller's
-- search_path is a guarantee about the caller's session rather than about
-- the data.
create or replace function public.record_card_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref   text;
  v_table text;
  v_id    bigint;
begin
  if tg_op = 'INSERT' then
    -- The mint's ref is the pack it fell out of, read off the row rather
    -- than announced by the caller. Null for copies minted by anything
    -- that is not a pack (an admin grant, a future comp).
    insert into public.card_provenance (inventory_id, event, to_discord, ref_table, ref_id, at)
    values (new.id, 'minted', new.discord_id,
            case when new.pack_open_id is not null then 'card_pack_opens' end,
            new.pack_open_id, new.acquired_at);
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord)
    values (old.id, 'dusted', old.discord_id);
    return null;
  end if;

  -- UPDATE: a transfer, and the only event whose cause the row itself
  -- cannot state. The caller says so through the GUC; missing, malformed
  -- and empty all read as "no ref" rather than as an error, because
  -- refusing to record an unattributed transfer would lose the transfer
  -- too. `true` on current_setting is what makes an unset GUC null instead
  -- of raising 42704.
  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;

  insert into public.card_provenance (inventory_id, event, from_discord, to_discord, ref_table, ref_id)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id);
  return null;
end;
$$;

-- AFTER, not BEFORE, for all three: a history row for a write that then
-- fails is worse than no history at all, and card_inventory_expedition_guard
-- is a BEFORE trigger that raises — a deployed copy's refused transfer must
-- leave no trace of a move that never happened.
create trigger card_inventory_provenance_mint
  after insert on public.card_inventory
  for each row execute function public.record_card_provenance();

-- `of discord_id` plus the WHEN clause: a copy's expedition mark is written
-- by updating `card`, and re-stamping "transferred from X to X" every time
-- an expedition returns would bury the real moves.
create trigger card_inventory_provenance_transfer
  after update of discord_id on public.card_inventory
  for each row when (old.discord_id is distinct from new.discord_id)
  execute function public.record_card_provenance();

create trigger card_inventory_provenance_dust
  after delete on public.card_inventory
  for each row execute function public.record_card_provenance();

-- === Backfill ===============================================================
-- The history that already happened, reconstructed from what was recorded
-- at the time. It is necessarily thinner than what the triggers will write
-- from here on: a copy dusted last month left no row to reconstruct from,
-- so the chain starts at "minted" for everything still alive and picks up
-- every accepted trade on top.
--
-- Guarded on the table being empty so a re-run cannot double the chain.
do $$
begin
  if exists (select 1 from public.card_provenance) then return; end if;

  -- One mint per surviving copy, dated when it was actually pulled.
  insert into public.card_provenance (inventory_id, event, to_discord, ref_table, ref_id, at)
  select ci.id, 'minted', ci.discord_id,
         case when ci.pack_open_id is not null then 'card_pack_opens' end,
         ci.pack_open_id, ci.acquired_at
    from public.card_inventory ci;

  -- Every accepted trade moved two sets of cards in opposite directions.
  -- decided_at is when it happened; the coalesce covers any row accepted
  -- before that column was being stamped. Ids whose copies have since been
  -- dusted are kept — that is exactly the history the missing FK protects.
  insert into public.card_provenance (inventory_id, event, from_discord, to_discord, ref_table, ref_id, at)
  select moved.inv_id, 'transferred', t.from_discord, t.to_discord, 'card_trades', t.id,
         coalesce(t.decided_at, t.created_at)
    from public.card_trades t
    cross join lateral unnest(t.offered_inventory_ids) as moved(inv_id)
   where t.status = 'accepted'
   union all
  select moved.inv_id, 'transferred', t.to_discord, t.from_discord, 'card_trades', t.id,
         coalesce(t.decided_at, t.created_at)
    from public.card_trades t
    cross join lateral unnest(t.requested_inventory_ids) as moved(inv_id)
   where t.status = 'accepted';
end;
$$;

-- === Grants =================================================================
-- Deny-all RLS with a service-role grant, exactly like card_inventory and
-- card_trades: a chain of custody names who holds what, which is the same
-- information the collection itself is closed over. The app reads it
-- through the service client after checking who is asking
-- (fetchProvenanceAction). Unlike card_print_runs, whose counts are
-- impersonal, this table is people.
alter table public.card_provenance enable row level security;

grant all on public.card_provenance to service_role;

-- === accept_card_trade ======================================================
-- Re-declared in full rather than patched, the dust_card ruling
-- (20260911000001): a reader comparing this against 20260826000018 should
-- see one function, not a diff. The ONLY change is the set_config below —
-- everything else is that migration's body, unchanged.
--
-- Two updates, one ref: both statements belong to the same trade, so the
-- GUC is set once ahead of the pair. It is transaction-local, and this
-- function's own `set search_path` clause means Postgres unwinds settings
-- made inside it when it returns — so the value is visible exactly where it
-- is needed (the triggers firing under these two updates) and nowhere else.
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

  -- The one addition to this function: name the cause of the two moves
  -- below, so card_inventory_provenance_transfer can stamp them
  -- 'card_trades:<id>' instead of recording two anonymous hand-offs.
  perform set_config('fpl.provenance_ref', 'card_trades:' || p_trade, true);

  update card_inventory set discord_id = v_trade.to_discord
    where id = any(v_trade.offered_inventory_ids);
  update card_inventory set discord_id = v_trade.from_discord
    where id = any(v_trade.requested_inventory_ids);

  update card_trades set status = 'accepted', decided_at = now() where id = p_trade;
end;
$$;

revoke execute on function public.accept_card_trade(bigint, text) from public, anon, authenticated;
grant execute on function public.accept_card_trade(bigint, text) to service_role;
