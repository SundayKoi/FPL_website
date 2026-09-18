-- Season's End collectible releases.
--
-- This product intentionally has its own catalog, opening, inventory and
-- test-wallet tables. Best Of and Accolade payloads are not player-card rows;
-- keeping them out of card_inventory prevents ordinary gameplay, print runs,
-- auto-dust and public search from accidentally treating them as rated cards.
-- The service-role-only RPCs are the transaction boundary. The web actions
-- authenticate the session and staff role before calling them, while these
-- functions keep price, state, request idempotency and fulfillment atomic.

create table if not exists public.season_end_releases (
  id                    uuid primary key default gen_random_uuid(),
  league                text not null check (league in ('premier', 'academy')),
  season                text not null,
  state                 text not null default 'draft'
                          check (state in ('draft', 'admin_test', 'public')),
  paused                boolean not null default false,
  price                 bigint not null default 500 check (price > 0),
  catalog_hash          text not null,
  rules_version         text not null,
  catalog_version       integer not null default 1 check (catalog_version > 0),
  withheld_awards       jsonb not null default '[]'::jsonb,
  signature_calibration jsonb,
  test_approved_at      timestamptz,
  test_approved_by      text,
  published_at          timestamptz,
  created_by            text not null,
  updated_by            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check ((league = 'academy') = (upper(season) like 'A%')),
  unique (league, season, catalog_version)
);

comment on table public.season_end_releases is
  'Immutable-by-publication Season''s End release rules and catalog audit state.';

create table if not exists public.season_end_designs (
  release_id     uuid not null references public.season_end_releases(id) on delete restrict,
  design_id      text not null,
  kind           text not null check (kind in ('season', 'best_of', 'accolade')),
  payload        jsonb not null,
  base_salvage   bigint not null check (base_salvage > 0),
  created_at     timestamptz not null default now(),
  primary key (release_id, design_id)
);

create index if not exists season_end_designs_kind_idx
  on public.season_end_designs (release_id, kind);

create table if not exists public.season_end_release_events (
  id          bigint generated always as identity primary key,
  release_id  uuid not null references public.season_end_releases(id) on delete restrict,
  actor       text not null,
  event       text not null,
  from_state  text,
  to_state    text,
  catalog_hash text,
  at          timestamptz not null default now()
);

create table if not exists public.season_end_test_wallets (
  release_id uuid not null references public.season_end_releases(id) on delete restrict,
  discord_id text not null references public.betting_profiles(discord_id) on delete restrict,
  balance    bigint not null default 6000 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (release_id, discord_id)
);

create table if not exists public.season_end_openings (
  opening_id       uuid primary key default gen_random_uuid(),
  request_id       uuid not null,
  discord_id       text not null references public.betting_profiles(discord_id),
  release_id       uuid not null references public.season_end_releases(id) on delete restrict,
  mode             text not null check (mode in ('admin_test', 'public')),
  status           text not null default 'pending'
                   check (status in ('pending', 'fulfilled', 'refunded')),
  price            bigint not null check (price > 0),
  pack_open_id     bigint references public.card_pack_opens(id) on delete set null,
  outcome          jsonb,
  card_ids         bigint[] not null default '{}'::bigint[],
  test_balance_after bigint,
  created_at       timestamptz not null default now(),
  fulfilled_at     timestamptz,
  unique (discord_id, request_id)
);

create index if not exists season_end_openings_release_idx
  on public.season_end_openings (release_id, mode, status);

create table if not exists public.season_end_inventory (
  id            bigint generated always as identity primary key,
  release_id    uuid not null references public.season_end_releases(id) on delete restrict,
  opening_id    uuid not null references public.season_end_openings(opening_id) on delete restrict,
  discord_id    text not null references public.betting_profiles(discord_id),
  mode          text not null check (mode in ('admin_test', 'public')),
  design_id     text not null,
  kind          text not null check (kind in ('season', 'best_of', 'accolade')),
  foil          boolean not null default false,
  foil_type     text,
  signed        boolean not null default false,
  autograph     text,
  payload       jsonb not null,
  created_at    timestamptz not null default now(),
  foreign key (release_id, design_id) references public.season_end_designs(release_id, design_id) on delete restrict,
  unique (opening_id, design_id)
);

create index if not exists season_end_inventory_owner_idx
  on public.season_end_inventory (discord_id, release_id, mode);
create index if not exists season_end_inventory_design_idx
  on public.season_end_inventory (release_id, design_id, mode);

create table if not exists public.season_end_provenance (
  id            bigint generated always as identity primary key,
  inventory_id  bigint not null references public.season_end_inventory(id) on delete restrict,
  event         text not null check (event in ('minted', 'dusted')),
  discord_id    text not null,
  opening_id    uuid references public.season_end_openings(opening_id) on delete set null,
  at            timestamptz not null default now()
);

alter table public.season_end_releases enable row level security;
alter table public.season_end_designs enable row level security;
alter table public.season_end_release_events enable row level security;
alter table public.season_end_test_wallets enable row level security;
alter table public.season_end_openings enable row level security;
alter table public.season_end_inventory enable row level security;
alter table public.season_end_provenance enable row level security;

revoke all on table public.season_end_releases, public.season_end_designs,
  public.season_end_release_events, public.season_end_test_wallets,
  public.season_end_openings, public.season_end_inventory,
  public.season_end_provenance from anon, authenticated;
grant all on table public.season_end_releases, public.season_end_designs,
  public.season_end_release_events, public.season_end_test_wallets,
  public.season_end_openings, public.season_end_inventory,
  public.season_end_provenance to service_role;

-- A request UUID is deliberately scoped to the caller, not to a release. A
-- browser retry accidentally pointed at another release must be an error,
-- never a second charge.
create or replace function public.begin_season_end_opening(
  p_request_id uuid,
  p_user text,
  p_release uuid,
  p_mode text
)
returns table(
  opening_id uuid,
  status text,
  price bigint,
  mode text,
  test_balance bigint,
  outcome jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.season_end_openings%rowtype;
  v_release public.season_end_releases%rowtype;
  v_wallet public.season_end_test_wallets%rowtype;
  v_pack_open bigint;
begin
  if p_mode not in ('admin_test', 'public') then raise exception 'invalid Season''s End mode'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user || ':' || p_request_id::text, 0));

  select * into v_existing
    from public.season_end_openings
   where discord_id = p_user and request_id = p_request_id
   for update;
  if found then
    if v_existing.release_id <> p_release or v_existing.mode <> p_mode then
      raise exception 'request id was already used for another Season''s End product';
    end if;
    return query select v_existing.opening_id, v_existing.status, v_existing.price,
                        v_existing.mode, v_existing.test_balance_after, v_existing.outcome;
    return;
  end if;

  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if v_release.paused then raise exception 'Season''s End release is paused'; end if;
  if v_release.catalog_hash = '' then raise exception 'Season''s End catalog is incomplete'; end if;
  if p_mode = 'public' and v_release.state <> 'public' then raise exception 'Season''s End release is not public'; end if;
  if p_mode = 'admin_test' and v_release.state <> 'admin_test' then raise exception 'Season''s End release is not in admin test mode'; end if;

  if p_mode = 'admin_test' then
    insert into public.season_end_test_wallets (release_id, discord_id)
      values (v_release.id, p_user)
      on conflict (release_id, discord_id) do nothing;
    select * into v_wallet from public.season_end_test_wallets
      where release_id = v_release.id and discord_id = p_user for update;
    if v_wallet.balance < v_release.price then raise exception 'insufficient Season''s End test balance'; end if;
    update public.season_end_test_wallets
       set balance = balance - v_release.price, updated_at = now()
     where release_id = v_release.id and discord_id = p_user;
  else
    v_pack_open := public.open_card_pack(p_user, v_release.season, v_release.price);
  end if;

  insert into public.season_end_openings
    (request_id, discord_id, release_id, mode, price, pack_open_id, test_balance_after)
  values
    (p_request_id, p_user, v_release.id, p_mode, v_release.price, v_pack_open,
     case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end)
  returning season_end_openings.opening_id into opening_id;

  status := 'pending';
  price := v_release.price;
  mode := p_mode;
  test_balance := case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end;
  outcome := null;
  return next;
end;
$$;

create or replace function public.prepare_season_end_opening(p_opening uuid, p_outcome jsonb)
returns table(outcome jsonb, prepared boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.season_end_openings%rowtype;
  v_count int;
begin
  select * into v_opening from public.season_end_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown Season''s End opening'; end if;
  if v_opening.status = 'refunded' then raise exception 'Season''s End opening was refunded'; end if;
  if v_opening.status = 'fulfilled' then
    return query select v_opening.outcome, false;
    return;
  end if;
  if jsonb_typeof(p_outcome) <> 'array' or jsonb_array_length(p_outcome) <> 5 then
    raise exception 'Season''s End opening must contain five cards';
  end if;

  select count(*) into v_count
    from jsonb_array_elements(p_outcome) as item
    join public.season_end_designs d
      on d.release_id = v_opening.release_id
     and d.design_id = item.value ->> 'design_id'
     and d.kind = item.value ->> 'kind';
  if v_count <> 5 then raise exception 'Season''s End outcome has an unknown design'; end if;
  select count(distinct item.value ->> 'design_id') into v_count from jsonb_array_elements(p_outcome) as item;
  if v_count <> 5 then raise exception 'Season''s End outcome contains duplicate designs'; end if;
  if exists (select 1 from jsonb_array_elements(p_outcome) with ordinality as item(value, ordinal) where ordinal <= 2 and item.value ->> 'kind' <> 'season') then
    raise exception 'Season''s End first two slots must be Season Cards';
  end if;
  if exists (select 1 from jsonb_array_elements(p_outcome) with ordinality as item(value, ordinal) where ordinal in (3, 4) and (item.value ->> 'kind') not in ('accolade', 'best_of')) then
    raise exception 'Season''s End award slots are invalid';
  end if;
  if (p_outcome -> 4 ->> 'guaranteed_foil')::boolean is not true
     or (p_outcome -> 4 ->> 'foil')::boolean is not true
     or nullif(p_outcome -> 4 ->> 'foil_type', '') is null then
    raise exception 'Season''s End last slot must be a guaranteed foil';
  end if;
  if exists (select 1 from jsonb_array_elements(p_outcome) as item where item.value ->> 'kind' = 'accolade' and ((item.value ->> 'signed')::boolean is true or item.value ->> 'autograph' is not null)) then
    raise exception 'Season''s End accolades cannot be signed';
  end if;
  if exists (select 1 from jsonb_array_elements(p_outcome) as item where (item.value ->> 'signed')::boolean is true and item.value ->> 'autograph' is null) then
    raise exception 'signed Season''s End cards need a frozen autograph';
  end if;

  if v_opening.outcome is not null and v_opening.outcome <> p_outcome then
    raise exception 'Season''s End outcome was already prepared';
  end if;
  if v_opening.outcome is null then
    update public.season_end_openings set outcome = p_outcome where opening_id = p_opening;
    return query select p_outcome, true;
  else
    return query select v_opening.outcome, false;
  end if;
end;
$$;

create or replace function public.fulfill_season_end_opening(p_opening uuid, p_outcome jsonb)
returns table(card_ids bigint[], minted boolean, test_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.season_end_openings%rowtype;
  v_item jsonb;
  v_id bigint;
  v_ids bigint[] := '{}'::bigint[];
begin
  select * into v_opening from public.season_end_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown Season''s End opening'; end if;
  if v_opening.status = 'fulfilled' then
    return query select v_opening.card_ids, false, v_opening.test_balance_after;
    return;
  end if;
  if v_opening.status = 'refunded' then raise exception 'Season''s End opening was refunded'; end if;
  if v_opening.outcome is null then
    perform public.prepare_season_end_opening(p_opening, p_outcome);
    v_opening.outcome := p_outcome;
  end if;
  if v_opening.outcome is null then raise exception 'Season''s End outcome was not prepared'; end if;

  for v_item in select value from jsonb_array_elements(v_opening.outcome)
  loop
    insert into public.season_end_inventory
      (release_id, opening_id, discord_id, mode, design_id, kind, foil, foil_type, signed, autograph, payload)
    values
      (v_opening.release_id, v_opening.opening_id, v_opening.discord_id, v_opening.mode,
       v_item ->> 'design_id', v_item ->> 'kind', coalesce((v_item ->> 'foil')::boolean, false),
       v_item ->> 'foil_type', coalesce((v_item ->> 'signed')::boolean, false), v_item ->> 'autograph',
       v_item -> 'payload')
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
    insert into public.season_end_provenance (inventory_id, event, discord_id, opening_id)
      values (v_id, 'minted', v_opening.discord_id, v_opening.opening_id);
  end loop;

  update public.season_end_openings
     set status = 'fulfilled', card_ids = v_ids, fulfilled_at = now()
   where opening_id = p_opening;
  return query select v_ids, true, v_opening.test_balance_after;
end;
$$;

create or replace function public.refund_season_end_opening(p_opening uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.season_end_openings%rowtype;
begin
  select * into v_opening from public.season_end_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown Season''s End opening'; end if;
  if v_opening.status in ('fulfilled', 'refunded') then return; end if;
  if exists (select 1 from public.season_end_inventory where opening_id = p_opening) then raise exception 'Season''s End opening has cards'; end if;
  if v_opening.mode = 'public' then
    perform public.refund_card_pack(v_opening.pack_open_id);
  else
    update public.season_end_test_wallets
       set balance = balance + v_opening.price, updated_at = now()
     where release_id = v_opening.release_id and discord_id = v_opening.discord_id;
    if not found then raise exception 'Season''s End test wallet cannot be restored'; end if;
  end if;
  update public.season_end_openings set status = 'refunded' where opening_id = p_opening;
end;
$$;

create or replace function public.approve_season_end_release(p_release uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_season int;
  v_best_of int;
  v_accolade int;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found or v_release.state <> 'admin_test' then raise exception 'release is not in admin test'; end if;
  select count(*) filter (where kind = 'season'), count(*) filter (where kind = 'best_of'), count(*) filter (where kind = 'accolade')
    into v_season, v_best_of, v_accolade
    from public.season_end_designs where release_id = p_release;
  if v_season < 2 or v_best_of < 1 or v_accolade < 1 or v_release.catalog_hash = '' or v_release.signature_calibration is null then
    raise exception 'test approval requires a complete calibrated catalog';
  end if;
  update public.season_end_releases
     set test_approved_at = now(), test_approved_by = p_actor, updated_by = p_actor, updated_at = now()
   where id = p_release;
  insert into public.season_end_release_events (release_id, actor, event, from_state, to_state, catalog_hash)
    values (p_release, p_actor, 'test_approved', v_release.state, v_release.state, v_release.catalog_hash);
end;
$$;

create or replace function public.protect_season_end_public_release()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.state = 'public' and (
    new.state is distinct from old.state
    or new.league is distinct from old.league
    or new.season is distinct from old.season
    or new.price is distinct from old.price
    or new.catalog_hash is distinct from old.catalog_hash
    or new.rules_version is distinct from old.rules_version
    or new.catalog_version is distinct from old.catalog_version
    or new.withheld_awards is distinct from old.withheld_awards
    or new.signature_calibration is distinct from old.signature_calibration
  ) then
    raise exception 'published Season''s End releases are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists season_end_public_release_immutable on public.season_end_releases;
create trigger season_end_public_release_immutable
before update on public.season_end_releases
for each row execute function public.protect_season_end_public_release();

create or replace function public.transition_season_end_release(
  p_release uuid,
  p_state text,
  p_actor text,
  p_catalog_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.season_end_releases%rowtype;
begin
  if p_state not in ('admin_test', 'public') then raise exception 'invalid Season''s End state'; end if;
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if p_catalog_hash <> v_release.catalog_hash or p_catalog_hash = '' then raise exception 'catalog hash mismatch'; end if;
  if p_state = 'admin_test' and v_release.state <> 'draft' then raise exception 'release must start in draft'; end if;
  if p_state = 'public' and (v_release.state <> 'admin_test' or v_release.test_approved_at is null) then raise exception 'public release requires test approval'; end if;
  update public.season_end_releases
     set state = p_state, published_at = case when p_state = 'public' then now() else published_at end,
         updated_by = p_actor, updated_at = now()
   where id = p_release;
  insert into public.season_end_release_events (release_id, actor, event, from_state, to_state, catalog_hash)
    values (p_release, p_actor, 'state_changed', v_release.state, p_state, p_catalog_hash);
end;
$$;

-- Product-specific salvage quote. Public copies remain isolated from
-- card_inventory's ordinary pricing contract, while this is the SQL source
-- used by any future dust action and the JS simulator mirrors exactly.
create or replace function public.season_end_dust_value(p_kind text, p_foil_type text, p_signed boolean, p_patron boolean default false)
returns bigint
language sql
immutable
set search_path = public
as $$
  select (round((case when p_kind = 'season' then 20 else 30 end)
    * case p_foil_type when 'prisma' then 2 when 'aurora' then 3 when 'refractor' then 4.5 when 'ice' then 6.5 else 1 end
    + case when coalesce(p_signed, false) then 1200 else 0 end)
    * case when coalesce(p_patron, false) then 1.2 else 1 end)::bigint;
$$;

revoke all on function public.begin_season_end_opening(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.prepare_season_end_opening(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fulfill_season_end_opening(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.refund_season_end_opening(uuid) from public, anon, authenticated;
revoke all on function public.approve_season_end_release(uuid, text) from public, anon, authenticated;
revoke all on function public.transition_season_end_release(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.season_end_dust_value(text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.begin_season_end_opening(uuid, text, uuid, text) to service_role;
grant execute on function public.prepare_season_end_opening(uuid, jsonb) to service_role;
grant execute on function public.fulfill_season_end_opening(uuid, jsonb) to service_role;
grant execute on function public.refund_season_end_opening(uuid) to service_role;
grant execute on function public.approve_season_end_release(uuid, text) to service_role;
grant execute on function public.transition_season_end_release(uuid, text, text, text) to service_role;
grant execute on function public.season_end_dust_value(text, text, boolean, boolean) to service_role;
