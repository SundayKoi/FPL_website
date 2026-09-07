-- God Packs: one server-owned opening identity for every standard opening.
--
-- `card_pack_opens` remains the money/daily ledger anchor. It is not the
-- opening identity because comped openings have no paid ledger row. This
-- table is the durable presentation and provenance anchor for paid, daily,
-- and comped standard packs.

create table if not exists public.card_pack_openings (
  opening_id     uuid primary key default gen_random_uuid(),
  request_id     uuid not null,
  discord_id     text not null references public.betting_profiles(discord_id),
  season         text not null,
  source         text not null check (source in ('paid', 'daily', 'comp')),
  variant        text not null default 'standard' check (variant in ('standard', 'god')),
  variant_resolved boolean not null default false,
  pack_open_id   bigint references public.card_pack_opens(id) on delete set null,
  status         text not null default 'pending' check (status in ('pending', 'fulfilled', 'refunded')),
  prepared_cards jsonb,
  card_ids       bigint[] not null default '{}'::bigint[],
  reveal_order   bigint[] not null default '{}'::bigint[],
  streak         int,
  streak_bonus   bigint not null default 0,
  comps_left     int,
  created_at     timestamptz not null default now(),
  fulfilled_at   timestamptz,
  unique (discord_id, request_id)
);

comment on table public.card_pack_openings is
  'Server-owned identity, variant, presentation order, and fulfillment state for standard pack openings.';
comment on column public.card_pack_openings.request_id is
  'Opaque client retry key. It is unique per user; the server owns opening_id and all outcome fields.';
comment on column public.card_pack_openings.reveal_order is
  'Inventory ids in intended reveal order, not rarity-sorted order.';
comment on column public.card_pack_openings.variant_resolved is
  'The server-side God Pack gate has been committed exactly once for this opening.';

alter table public.card_pack_openings enable row level security;
grant all on public.card_pack_openings to service_role;

alter table public.card_inventory
  add column if not exists opening_id uuid references public.card_pack_openings(opening_id) on delete set null;

create index if not exists card_inventory_opening_idx on public.card_inventory (opening_id);

alter table public.card_provenance
  add column if not exists opening_id uuid;

create index if not exists card_provenance_opening_idx on public.card_provenance (opening_id)
  where opening_id is not null;

-- Pack identity is immutable after mint. Ownership and card presentation
-- updates remain available to their existing trusted server workflows.
create or replace function public.protect_card_pack_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    new.opening_id is distinct from old.opening_id
    or new.pack_open_id is distinct from old.pack_open_id
  ) then
    raise exception 'pack provenance is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists card_inventory_pack_identity_guard on public.card_inventory;
create trigger card_inventory_pack_identity_guard
  before update on public.card_inventory
  for each row execute function public.protect_card_pack_identity();

-- Replace the recorder so the durable opening identity is copied into every
-- mint and transfer-history row. Existing copies keep a null opening_id.
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
    insert into public.card_provenance
      (inventory_id, event, to_discord, ref_table, ref_id, opening_id, at)
    values (
      new.id,
      'minted',
      new.discord_id,
      case when new.pack_open_id is not null then 'card_pack_opens' end,
      new.pack_open_id,
      new.opening_id,
      new.acquired_at
    );
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.card_provenance (inventory_id, event, from_discord, opening_id)
    values (old.id, 'dusted', old.discord_id, old.opening_id);
    return null;
  end if;

  v_ref := nullif(current_setting('fpl.provenance_ref', true), '');
  if v_ref ~ '^[a-z_]+:[0-9]+$' then
    v_table := split_part(v_ref, ':', 1);
    v_id := split_part(v_ref, ':', 2)::bigint;
  end if;

  insert into public.card_provenance
    (inventory_id, event, from_discord, to_discord, ref_table, ref_id, opening_id)
  values (new.id, 'transferred', old.discord_id, new.discord_id, v_table, v_id, new.opening_id);
  return null;
end;
$$;

-- A single transaction owns the charge/claim and the opening row. The
-- advisory lock makes the request key idempotent before any wallet or comp
-- mutation happens.
create or replace function public.begin_card_pack_opening(
  p_request_id uuid,
  p_user text,
  p_season text,
  p_source text,
  p_cost bigint default 200
)
returns table(
  opening_id uuid,
  open_id bigint,
  source text,
  status text,
  variant text,
  variant_resolved boolean,
  streak int,
  bonus bigint,
  comps_left int,
  card_ids bigint[],
  reveal_order bigint[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing card_pack_openings%rowtype;
  v_open_id bigint;
  v_streak int;
  v_bonus bigint := 0;
  v_comps_left int;
  v_opening_id uuid;
  v_source text;
begin
  if p_source not in ('standard', 'paid', 'daily', 'comp') then
    raise exception 'invalid pack source';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user || ':' || p_request_id::text, 0));

  select * into v_existing
    from public.card_pack_openings
   where discord_id = p_user and request_id = p_request_id
   for update;
  if found then
    return query select
      v_existing.opening_id,
      v_existing.pack_open_id,
      v_existing.source,
      v_existing.status,
      v_existing.variant,
      v_existing.variant_resolved,
      v_existing.streak,
      v_existing.streak_bonus,
      v_existing.comps_left,
      v_existing.card_ids,
      v_existing.reveal_order;
    return;
  end if;

  if p_source = 'paid' then
    v_source := 'paid';
    v_open_id := public.open_card_pack(p_user, p_season, p_cost);
  elsif p_source = 'daily' then
    v_source := 'daily';
    select d.open_id, d.streak, d.bonus
      into v_open_id, v_streak, v_bonus
      from public.open_daily_pack(p_user, p_season) d;
  else
    select remaining into v_comps_left
      from public.card_pack_comps
     where discord_id = p_user and kind = 'standard'
     for update;
    if not found or v_comps_left <= 0 then
      if p_source = 'comp' then raise exception 'no standard pack comp'; end if;
      v_source := 'paid';
      v_open_id := public.open_card_pack(p_user, p_season, p_cost);
    else
      v_source := 'comp';
      v_comps_left := v_comps_left - 1;
      update public.card_pack_comps
         set remaining = v_comps_left
       where discord_id = p_user and kind = 'standard';
    end if;
  end if;

  insert into public.card_pack_openings
    (request_id, discord_id, season, source, pack_open_id, streak, streak_bonus, comps_left)
  values
    (p_request_id, p_user, p_season, v_source, v_open_id, v_streak, v_bonus, v_comps_left)
  returning card_pack_openings.opening_id into v_opening_id;

  return query select v_opening_id, v_open_id, v_source, 'pending'::text, 'standard'::text,
                      false, v_streak, v_bonus, v_comps_left, '{}'::bigint[], '{}'::bigint[];
end;
$$;

-- Persist the one CSPRNG gate result before any card roll. A retry that lands
-- on the same pending opening gets the committed answer instead of rolling a
-- second variant; the row lock makes two concurrent retries choose one.
create or replace function public.set_card_pack_variant(
  p_opening uuid,
  p_variant text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening card_pack_openings%rowtype;
begin
  if p_variant not in ('standard', 'god') then raise exception 'invalid pack variant'; end if;
  select * into v_opening from public.card_pack_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown pack opening'; end if;
  if v_opening.status = 'refunded' then raise exception 'pack opening was refunded'; end if;
  if v_opening.variant_resolved then return v_opening.variant; end if;
  update public.card_pack_openings
     set variant = p_variant, variant_resolved = true
   where opening_id = p_opening;
  return p_variant;
end;
$$;

-- The server is the only caller. p_cards carries the complete frozen card
-- json plus denormalized inventory fields, and this function inserts every
-- card before committing the opening as fulfilled. A retry returns the same
-- ids without charging or minting again.
create or replace function public.fulfill_card_pack_opening(
  p_opening uuid,
  p_variant text,
  p_cards jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening card_pack_openings%rowtype;
  v_item record;
  v_id bigint;
  v_ids bigint[] := '{}'::bigint[];
begin
  if p_variant not in ('standard', 'god') then raise exception 'invalid pack variant'; end if;

  select * into v_opening from public.card_pack_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown pack opening'; end if;
  if v_opening.status = 'fulfilled' then
    return jsonb_build_object('card_ids', v_opening.card_ids, 'minted', false);
  end if;
  if v_opening.status = 'refunded' then raise exception 'pack opening was refunded'; end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) <> 5 then
    raise exception 'a standard pack must contain five cards';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_cards) as x(
      slug text,
      player_name text,
      role text,
      edition_week date,
      overall int,
      tier text,
      foil boolean,
      foil_type text,
      signed boolean,
      card_json jsonb
    )
  loop
    if v_item.slug is null or v_item.player_name is null or v_item.role is null
       or v_item.edition_week is null or v_item.overall is null or v_item.tier is null
       or v_item.card_json is null then
      raise exception 'invalid frozen pack card';
    end if;

    insert into public.card_inventory
      (discord_id, season, slug, player_name, role, edition_week, overall, tier,
       foil, foil_type, signed, card, pack_open_id, opening_id)
    values
      (v_opening.discord_id, v_opening.season, v_item.slug, v_item.player_name, v_item.role,
       v_item.edition_week, v_item.overall, v_item.tier, coalesce(v_item.foil, false),
       v_item.foil_type, coalesce(v_item.signed, false), v_item.card_json,
       v_opening.pack_open_id, v_opening.opening_id)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  update public.card_pack_openings
     set variant = p_variant,
         variant_resolved = true,
         status = 'fulfilled',
         prepared_cards = p_cards,
         card_ids = v_ids,
         reveal_order = v_ids,
         fulfilled_at = now()
   where opening_id = v_opening.opening_id;

  return jsonb_build_object('card_ids', v_ids, 'minted', true);
end;
$$;

-- Compensate the source used by begin_card_pack_opening. The fulfilled guard
-- is the retry arbiter: a successful mint can never be refunded by a late
-- error handler.
create or replace function public.refund_card_pack_opening(p_opening uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening card_pack_openings%rowtype;
  v_profile_balance bigint;
begin
  select * into v_opening from public.card_pack_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown pack opening'; end if;
  if v_opening.status = 'fulfilled' or v_opening.status = 'refunded' then return; end if;
  if exists (select 1 from public.card_inventory where opening_id = p_opening) then
    raise exception 'pack opening has cards';
  end if;

  if v_opening.source = 'paid' then
    perform public.refund_card_pack(v_opening.pack_open_id);
  elsif v_opening.source = 'daily' then
    -- Remove the claim so the Eastern-day limit and streak return to their
    -- pre-open state. Reverse a milestone bonus through the ledger rather
    -- than deleting accounting history.
    perform 1 from public.betting_profiles where discord_id = v_opening.discord_id for update;
    if v_opening.streak_bonus > 0 then
      insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (v_opening.discord_id, -v_opening.streak_bonus, 'daily_rip_refund', 'card_pack_opens', v_opening.pack_open_id);
      update public.betting_profiles
         set balance = balance - v_opening.streak_bonus
       where discord_id = v_opening.discord_id
       returning balance into v_profile_balance;
    end if;
    delete from public.card_pack_opens where id = v_opening.pack_open_id;
  else
    update public.card_pack_comps
       set remaining = remaining + 1
     where discord_id = v_opening.discord_id and kind = 'standard';
    if not found then raise exception 'standard pack comp cannot be restored'; end if;
  end if;

  update public.card_pack_openings set status = 'refunded' where opening_id = p_opening;
end;
$$;

revoke all on function public.begin_card_pack_opening(uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.fulfill_card_pack_opening(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.refund_card_pack_opening(uuid) from public, anon, authenticated;
revoke all on function public.set_card_pack_variant(uuid, text) from public, anon, authenticated;
grant execute on function public.begin_card_pack_opening(uuid, text, text, text, bigint) to service_role;
grant execute on function public.fulfill_card_pack_opening(uuid, text, jsonb) to service_role;
grant execute on function public.refund_card_pack_opening(uuid) to service_role;
grant execute on function public.set_card_pack_variant(uuid, text) to service_role;
