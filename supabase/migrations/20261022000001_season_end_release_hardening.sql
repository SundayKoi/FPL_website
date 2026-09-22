-- Season's End release hardening.
--
-- This is a forward migration. It makes a release a versioned contract,
-- freezes every input at admin-test entry, makes outcome preparation
-- first-writer-wins, and gives Season's End copies their own commerce and
-- dust boundary. Standard card tables and RPCs remain unchanged.

alter table public.season_end_releases
  add column if not exists revision_digest text not null default '',
  add column if not exists economy_version text not null default 'season-end-economy-2026-09-v1',
  add column if not exists economy_payload jsonb not null default '{}'::jsonb,
  add column if not exists signing_book jsonb not null default '[]'::jsonb,
  add column if not exists source_completeness jsonb not null default '{}'::jsonb,
  add column if not exists verification_report jsonb,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists rules_payload jsonb not null default '{}'::jsonb;

update public.season_end_releases
   set economy_version = coalesce(nullif(economy_version, ''), 'season-end-economy-2026-09-v1'),
       economy_payload = case when economy_payload = '{}'::jsonb then jsonb_build_object(
         'version', 'season-end-economy-2026-09-v1',
         'patronMultiplier', 1.2,
         'signatureBonus', 1200,
         'foilDustMultipliers', jsonb_build_object('prisma', 2, 'aurora', 3, 'refractor', 4.5, 'ice', 6.5),
         'baseSalvageByKind', jsonb_build_object('season', 20, 'best_of', 30, 'accolade', 30)
       ) else economy_payload end;

alter table public.season_end_releases
  alter column economy_payload set default '{"version":"season-end-economy-2026-09-v1","patronMultiplier":1.2,"signatureBonus":1200,"foilDustMultipliers":{"prisma":2,"aurora":3,"refractor":4.5,"ice":6.5},"baseSalvageByKind":{"season":20,"best_of":30,"accolade":30}}'::jsonb;

alter table public.season_end_openings
  add column if not exists revision_digest text not null default '',
  add column if not exists economy_version text not null default '',
  add column if not exists economy_payload jsonb not null default '{}'::jsonb,
  add column if not exists signing_book jsonb not null default '[]'::jsonb,
  add column if not exists rules_version text not null default '';

alter table public.season_end_inventory
  add column if not exists slot_position integer not null default 0,
  add column if not exists reveal_order integer not null default 0,
  add column if not exists lifecycle_status text not null default 'active',
  add column if not exists economy_version text not null default '',
  add column if not exists rules_version text not null default '',
  add column if not exists revision_digest text not null default '';

-- Preserve the order and frozen references of rows minted by the first
-- Season's End migration. New rows receive these values in fulfill; this
-- backfill keeps older public copies renderable and auditable after rollout.
with ranked as (
  select id, row_number() over (partition by opening_id order by id) as position
    from public.season_end_inventory
)
update public.season_end_inventory inventory
   set slot_position = ranked.position,
       reveal_order = ranked.position
  from ranked
 where inventory.id = ranked.id
   and inventory.slot_position = 0;

update public.season_end_openings opening
   set revision_digest = release.revision_digest,
       economy_version = release.economy_version,
       economy_payload = release.economy_payload,
       signing_book = release.signing_book,
       rules_version = release.rules_version
  from public.season_end_releases release
 where opening.release_id = release.id
   and (opening.revision_digest = '' or opening.economy_version = '' or opening.rules_version = '');

update public.season_end_inventory inventory
   set revision_digest = opening.revision_digest,
       economy_version = opening.economy_version,
       rules_version = opening.rules_version
  from public.season_end_openings opening
 where inventory.opening_id = opening.opening_id
   and (inventory.revision_digest = '' or inventory.economy_version = '' or inventory.rules_version = '');

alter table public.season_end_inventory
  drop constraint if exists season_end_inventory_lifecycle_status_check;
alter table public.season_end_inventory
  add constraint season_end_inventory_lifecycle_status_check
  check (lifecycle_status in ('active', 'sold', 'dusted'));
alter table public.season_end_inventory
  drop constraint if exists season_end_inventory_slot_position_check;
alter table public.season_end_inventory
  add constraint season_end_inventory_slot_position_check
  check (slot_position between 1 and 5 and reveal_order between 1 and 5);

alter table public.season_end_provenance
  drop constraint if exists season_end_provenance_event_check;
alter table public.season_end_provenance
  add constraint season_end_provenance_event_check
  check (event in ('minted', 'sold', 'traded', 'transferred', 'dusted'));

create index if not exists season_end_inventory_opening_slot_idx
  on public.season_end_inventory (opening_id, slot_position);
create index if not exists season_end_inventory_public_active_idx
  on public.season_end_inventory (release_id, lifecycle_status, mode);

-- A design is mutable only while its release is a draft. The release trigger
-- below protects the metadata; this trigger closes the row-level back door.
create or replace function public.protect_season_end_locked_design()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_state text;
begin
  select state into v_state from public.season_end_releases where id = coalesce(new.release_id, old.release_id);
  if v_state is distinct from 'draft' then
    raise exception 'Season''s End designs are immutable after lock';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists season_end_designs_immutable_after_lock on public.season_end_designs;
create trigger season_end_designs_immutable_after_lock
before insert or update or delete on public.season_end_designs
for each row execute function public.protect_season_end_locked_design();

create or replace function public.protect_season_end_release_inputs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.state in ('admin_test', 'public') and (
    new.league is distinct from old.league
    or new.season is distinct from old.season
    or new.price is distinct from old.price
    or new.catalog_hash is distinct from old.catalog_hash
    or new.rules_version is distinct from old.rules_version
    or new.catalog_version is distinct from old.catalog_version
    or new.withheld_awards is distinct from old.withheld_awards
    or new.signature_calibration is distinct from old.signature_calibration
    or new.revision_digest is distinct from old.revision_digest
    or new.economy_version is distinct from old.economy_version
    or new.economy_payload is distinct from old.economy_payload
    or new.signing_book is distinct from old.signing_book
    or new.source_completeness is distinct from old.source_completeness
    or new.rules_payload is distinct from old.rules_payload
  ) then
    raise exception 'locked Season''s End release inputs are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists season_end_public_release_immutable on public.season_end_releases;
drop trigger if exists season_end_release_inputs_immutable on public.season_end_releases;
create trigger season_end_release_inputs_immutable
before update on public.season_end_releases
for each row execute function public.protect_season_end_release_inputs();

-- One transaction replaces a draft's entire catalog and its frozen inputs.
create or replace function public.replace_season_end_draft_catalog(
  p_release uuid,
  p_expected_catalog_hash text,
  p_catalog_hash text,
  p_revision_digest text,
  p_rules_version text,
  p_rules_payload jsonb,
  p_economy_version text,
  p_economy_payload jsonb,
  p_signing_book jsonb,
  p_withheld_awards jsonb,
  p_source_completeness jsonb,
  p_signature_calibration jsonb,
  p_designs jsonb,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_item jsonb;
  v_count integer;
  v_season integer := 0;
  v_best_of integer := 0;
  v_accolade integer := 0;
  v_design_id text;
  v_kind text;
  v_payload jsonb;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if v_release.state <> 'draft' then raise exception 'only draft Season''s End releases can be replaced'; end if;
  if coalesce(v_release.catalog_hash, '') <> coalesce(p_expected_catalog_hash, '') then raise exception 'stale Season''s End draft revision'; end if;
  if p_catalog_hash = '' or p_revision_digest = '' then raise exception 'catalog and revision digests are required'; end if;
  if jsonb_typeof(p_designs) <> 'array' then raise exception 'Season''s End designs must be an array'; end if;
  if jsonb_array_length(p_designs) < 5 then raise exception 'Season''s End catalog must contain at least five designs'; end if;

  for v_item in select value from jsonb_array_elements(p_designs)
  loop
    v_design_id := v_item ->> 'design_id';
    v_kind := v_item ->> 'kind';
    v_payload := v_item -> 'payload';
    if v_design_id is null or v_design_id = '' or v_kind not in ('season', 'best_of', 'accolade') or jsonb_typeof(v_payload) <> 'object' then
      raise exception 'invalid Season''s End design payload';
    end if;
    if v_payload ->> 'designId' <> v_design_id or v_payload ->> 'releaseId' <> v_release.id::text or v_payload ->> 'league' <> v_release.league or v_payload ->> 'season' <> v_release.season then
      raise exception 'Season''s End design identity does not match its release';
    end if;
    if v_kind = 'season' then v_season := v_season + 1;
    elsif v_kind = 'best_of' then v_best_of := v_best_of + 1;
    else v_accolade := v_accolade + 1;
    end if;
  end loop;
  if v_season < 2 or v_best_of < 2 or v_accolade < 2 then
    raise exception 'Season''s End lock requires two designs in every family';
  end if;

  delete from public.season_end_designs where release_id = p_release;
  for v_item in select value from jsonb_array_elements(p_designs)
  loop
    insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
    values (p_release, v_item ->> 'design_id', v_item ->> 'kind', v_item -> 'payload', greatest(1, (v_item ->> 'base_salvage')::bigint));
  end loop;

  update public.season_end_releases
     set catalog_hash = p_catalog_hash,
         revision_digest = p_revision_digest,
         rules_version = p_rules_version,
         rules_payload = p_rules_payload,
         economy_version = p_economy_version,
         economy_payload = p_economy_payload,
         signing_book = p_signing_book,
         withheld_awards = p_withheld_awards,
         source_completeness = p_source_completeness,
         signature_calibration = p_signature_calibration,
         verification_report = null,
         test_approved_at = null,
         test_approved_by = null,
         updated_by = p_actor,
         updated_at = now()
   where id = p_release;
  insert into public.season_end_release_events (release_id, actor, event, from_state, to_state, catalog_hash)
    values (p_release, p_actor, 'catalog_replaced', v_release.state, v_release.state, p_catalog_hash);
end;
$$;

-- Recreate begin so a new opening pins every mutable release input at charge
-- time. The existing-opening branch intentionally precedes pause/eligibility
-- checks: recovery is not a new purchase.
drop function if exists public.begin_season_end_opening(uuid, text, uuid, text);
create function public.begin_season_end_opening(
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
  if p_request_id is null or p_mode not in ('admin_test', 'public') then raise exception 'invalid Season''s End opening input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user || ':' || p_request_id::text, 0));

  select * into v_existing from public.season_end_openings
   where discord_id = p_user and request_id = p_request_id for update;
  if found then
    if v_existing.release_id <> p_release or v_existing.mode <> p_mode then raise exception 'request id was already used for another Season''s End product'; end if;
    return query select v_existing.opening_id, v_existing.status, v_existing.price, v_existing.mode, v_existing.test_balance_after, v_existing.outcome;
    return;
  end if;

  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if v_release.paused then raise exception 'Season''s End release is paused'; end if;
  if v_release.state not in ('admin_test', 'public') or v_release.catalog_hash = '' or v_release.revision_digest = '' then raise exception 'Season''s End release is not locked'; end if;
  if p_mode = 'public' and v_release.state <> 'public' then raise exception 'Season''s End release is not public'; end if;
  if p_mode = 'admin_test' and v_release.state <> 'admin_test' then raise exception 'Season''s End release is not in admin test mode'; end if;

  if p_mode = 'admin_test' then
    insert into public.season_end_test_wallets (release_id, discord_id) values (v_release.id, p_user) on conflict (release_id, discord_id) do nothing;
    select * into v_wallet from public.season_end_test_wallets where release_id = v_release.id and discord_id = p_user for update;
    if v_wallet.balance < v_release.price then raise exception 'insufficient Season''s End test balance'; end if;
    update public.season_end_test_wallets set balance = balance - v_release.price, updated_at = now() where release_id = v_release.id and discord_id = p_user;
  else
    v_pack_open := public.open_card_pack(p_user, v_release.season, v_release.price);
  end if;

  insert into public.season_end_openings (request_id, discord_id, release_id, mode, price, pack_open_id, test_balance_after, revision_digest, economy_version, economy_payload, signing_book, rules_version)
  values (p_request_id, p_user, v_release.id, p_mode, v_release.price, v_pack_open,
    case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end,
    v_release.revision_digest, v_release.economy_version, v_release.economy_payload, v_release.signing_book, v_release.rules_version)
  returning season_end_openings.opening_id into opening_id;
  status := 'pending'; price := v_release.price; mode := p_mode;
  test_balance := case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end;
  outcome := null;
  return next;
end;
$$;

-- First writer wins. If a retry arrives after an outcome is stored, the
-- committed outcome is returned before looking at the competing candidate.
create or replace function public.prepare_season_end_opening(p_opening uuid, p_outcome jsonb)
returns table(outcome jsonb, prepared boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.season_end_openings%rowtype;
  v_release public.season_end_releases%rowtype;
  v_item record;
  v_design public.season_end_designs%rowtype;
  v_canonical jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_index integer := 0;
  v_foil boolean;
  v_signed boolean;
  v_autograph text;
  v_player_key text;
begin
  select * into v_opening from public.season_end_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown Season''s End opening'; end if;
  if v_opening.status = 'refunded' then raise exception 'Season''s End opening was refunded'; end if;
  if v_opening.status = 'fulfilled' or v_opening.outcome is not null then return query select v_opening.outcome, false; return; end if;
  if jsonb_typeof(p_outcome) <> 'array' or jsonb_array_length(p_outcome) <> 5 then raise exception 'Season''s End opening must contain five cards'; end if;

  for v_item in select value, ordinality from jsonb_array_elements(p_outcome) with ordinality
  loop
    v_index := v_item.ordinality;
    select * into v_design from public.season_end_designs where release_id = v_opening.release_id and design_id = v_item.value ->> 'design_id' for share;
    if not found or v_design.kind <> v_item.value ->> 'kind' then raise exception 'Season''s End outcome has an unknown design'; end if;
    if v_item.value ->> 'design_id' = any(v_ids) then raise exception 'Season''s End outcome contains duplicate designs'; end if;
    v_ids := array_append(v_ids, v_design.design_id);
    if v_index <= 2 and v_design.kind <> 'season' then raise exception 'Season''s End first two slots must be Season Cards'; end if;
    if v_index in (3, 4) and v_design.kind not in ('accolade', 'best_of') then raise exception 'Season''s End award slots are invalid'; end if;
    v_foil := coalesce((v_item.value ->> 'foil')::boolean, false);
    v_signed := coalesce((v_item.value ->> 'signed')::boolean, false);
    v_autograph := nullif(v_item.value ->> 'autograph', '');
    if v_foil and coalesce(v_item.value ->> 'foil_type', '') not in ('prisma', 'aurora', 'refractor', 'ice') then raise exception 'Season''s End foil type is invalid'; end if;
    if not v_foil and v_item.value ->> 'foil_type' is not null then raise exception 'matte Season''s End copies cannot carry a foil type'; end if;
    if v_index = 5 and (not v_foil or coalesce(v_item.value ->> 'guaranteed_foil', 'false')::boolean is not true) then raise exception 'Season''s End last slot must be a guaranteed foil'; end if;
    if v_index <> 5 and coalesce(v_item.value ->> 'guaranteed_foil', 'false')::boolean is true then raise exception 'only the fifth Season''s End slot is guaranteed foil'; end if;
    if v_design.kind = 'accolade' and (v_signed or v_autograph is not null) then raise exception 'Season''s End accolades cannot be signed'; end if;
    if v_signed then
      if v_design.kind = 'accolade' or v_design.payload ->> 'signatureEligible' <> 'true' or v_autograph is null then raise exception 'signed Season''s End cards need an eligible frozen autograph'; end if;
      v_player_key := v_design.payload #>> '{player,key}';
      if not exists (select 1 from jsonb_array_elements(v_opening.signing_book) as book where book ->> 'playerKey' = v_player_key and book ->> 'autograph' = v_autograph) then raise exception 'signed Season''s End card is not in the locked signing book'; end if;
    elsif v_autograph is not null then
      raise exception 'unsigned Season''s End cards cannot carry an autograph';
    end if;
    v_canonical := v_canonical || jsonb_build_array(jsonb_build_object(
      'design_id', v_design.design_id, 'kind', v_design.kind, 'foil', v_foil,
      'foil_type', nullif(v_item.value ->> 'foil_type', ''), 'signed', v_signed,
      'autograph', v_autograph, 'guaranteed_foil', coalesce((v_item.value ->> 'guaranteed_foil')::boolean, false),
      'payload', v_design.payload
    ));
  end loop;
  update public.season_end_openings set outcome = v_canonical where opening_id = p_opening;
  return query select v_canonical, true;
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
  v_item record;
  v_id bigint;
  v_ids bigint[] := '{}';
begin
  select * into v_opening from public.season_end_openings where opening_id = p_opening for update;
  if not found then raise exception 'unknown Season''s End opening'; end if;
  if v_opening.status = 'fulfilled' then return query select v_opening.card_ids, false, v_opening.test_balance_after; return; end if;
  if v_opening.status = 'refunded' then raise exception 'Season''s End opening was refunded'; end if;
  if v_opening.outcome is null then perform public.prepare_season_end_opening(p_opening, p_outcome); select * into v_opening from public.season_end_openings where opening_id = p_opening; end if;
  for v_item in select value, ordinality from jsonb_array_elements(v_opening.outcome) with ordinality
  loop
    insert into public.season_end_inventory
      (release_id, opening_id, discord_id, mode, design_id, kind, foil, foil_type, signed, autograph, payload, slot_position, reveal_order, lifecycle_status, economy_version, rules_version, revision_digest)
    values (v_opening.release_id, v_opening.opening_id, v_opening.discord_id, v_opening.mode,
      v_item.value ->> 'design_id', v_item.value ->> 'kind', coalesce((v_item.value ->> 'foil')::boolean, false),
      v_item.value ->> 'foil_type', coalesce((v_item.value ->> 'signed')::boolean, false), v_item.value ->> 'autograph',
      v_item.value -> 'payload', v_item.ordinality, v_item.ordinality, 'active', v_opening.economy_version, v_opening.rules_version, v_opening.revision_digest)
    returning id into v_id;
    v_ids := array_append(v_ids, v_id);
    insert into public.season_end_provenance (inventory_id, event, discord_id, opening_id) values (v_id, 'minted', v_opening.discord_id, v_opening.opening_id);
  end loop;
  update public.season_end_openings set status = 'fulfilled', card_ids = v_ids, fulfilled_at = now() where opening_id = p_opening;
  return query select v_ids, true, v_opening.test_balance_after;
end;
$$;

create table if not exists public.season_end_listings (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.season_end_releases(id) on delete restrict,
  inventory_id bigint not null references public.season_end_inventory(id) on delete restrict,
  seller_discord text not null references public.betting_profiles(discord_id),
  ask bigint not null check (ask between 1 and 100000),
  note text check (char_length(note) <= 80),
  status text not null default 'open' check (status in ('open', 'sold', 'cancelled', 'expired')),
  buyer_discord text references public.betting_profiles(discord_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  decided_at timestamptz
);
create unique index if not exists season_end_listings_one_open_per_copy on public.season_end_listings (inventory_id) where status = 'open';
create index if not exists season_end_listings_board_idx on public.season_end_listings (release_id, status, id);

create table if not exists public.season_end_wants (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.season_end_releases(id) on delete restrict,
  design_id text not null,
  discord_id text not null references public.betting_profiles(discord_id),
  bounty bigint not null check (bounty between 1 and 100000),
  note text check (char_length(note) <= 80),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  filled_inventory_id bigint,
  filled_by text references public.betting_profiles(discord_id),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists season_end_wants_board_idx on public.season_end_wants (release_id, status, id);

create table if not exists public.season_end_trades (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.season_end_releases(id) on delete restrict,
  from_discord text not null references public.betting_profiles(discord_id),
  to_discord text not null references public.betting_profiles(discord_id),
  offered_inventory_ids bigint[] not null default '{}',
  requested_inventory_ids bigint[] not null default '{}',
  offered_dollars bigint not null default 0 check (offered_dollars >= 0),
  requested_dollars bigint not null default 0 check (requested_dollars >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (from_discord <> to_discord),
  check (coalesce(array_length(offered_inventory_ids, 1), 0) + coalesce(array_length(requested_inventory_ids, 1), 0) > 0 or offered_dollars + requested_dollars > 0)
);
create index if not exists season_end_trades_to_idx on public.season_end_trades (to_discord, release_id, status);
create index if not exists season_end_trades_from_idx on public.season_end_trades (from_discord, release_id, status);

alter table public.season_end_listings enable row level security;
alter table public.season_end_wants enable row level security;
alter table public.season_end_trades enable row level security;
revoke all on table public.season_end_listings, public.season_end_wants, public.season_end_trades from anon, authenticated;
grant all on table public.season_end_listings, public.season_end_wants, public.season_end_trades to service_role;

create or replace function public.season_end_dust_quote(p_user text, p_inventory bigint)
returns table(value bigint, patron boolean, balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy public.season_end_inventory%rowtype;
  v_release public.season_end_releases%rowtype;
  v_base numeric;
  v_multiplier numeric := 1;
  v_patron boolean;
  v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for share;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  select * into v_release from public.season_end_releases where id = v_copy.release_id;
  v_base := coalesce((select base_salvage from public.season_end_designs where release_id = v_copy.release_id and design_id = v_copy.design_id), 0);
  if v_copy.foil_type is not null then v_multiplier := coalesce((v_release.economy_payload -> 'foilDustMultipliers' ->> v_copy.foil_type)::numeric, 1); end if;
  v_patron := exists (select 1 from public.betting_profiles where discord_id = p_user and patron_until > now());
  select bp.balance into v_balance from public.betting_profiles bp where bp.discord_id = p_user;
  return query select round((v_base * v_multiplier + case when v_copy.signed then coalesce((v_release.economy_payload ->> 'signatureBonus')::numeric, 0) else 0 end) * case when v_patron then coalesce((v_release.economy_payload ->> 'patronMultiplier')::numeric, 1) else 1 end)::bigint, v_patron, v_balance;
end;
$$;

create or replace function public.dust_season_end_copy(p_user text, p_inventory bigint)
returns table(value bigint, balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copy public.season_end_inventory%rowtype;
  v_quote record;
  v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  select * into v_quote from public.season_end_dust_quote(p_user, p_inventory);
  perform 1 from public.betting_profiles where discord_id = p_user for update;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (p_user, v_quote.value, 'season_end_dust', 'season_end_inventory', p_inventory);
  update public.betting_profiles set balance = betting_profiles.balance + v_quote.value where discord_id = p_user returning betting_profiles.balance into v_balance;
  update public.season_end_inventory set lifecycle_status = 'dusted' where id = p_inventory;
  update public.season_end_listings set status = 'cancelled', decided_at = now() where inventory_id = p_inventory and status = 'open';
  update public.season_end_trades set status = 'cancelled', decided_at = now() where status = 'pending' and (p_inventory = any(offered_inventory_ids) or p_inventory = any(requested_inventory_ids));
  insert into public.season_end_provenance (inventory_id, event, discord_id) values (p_inventory, 'dusted', p_user);
  return query select v_quote.value, v_balance;
end;
$$;

create or replace function public.create_season_end_listing(p_user text, p_inventory bigint, p_ask bigint, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_copy public.season_end_inventory%rowtype; v_id bigint;
begin
  if p_ask < 1 or p_ask > 100000 then raise exception 'invalid sale price'; end if;
  select * into v_copy from public.season_end_inventory where id = p_inventory for share;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  if p_note is not null and char_length(p_note) > 80 then raise exception 'listing note is too long'; end if;
  insert into public.season_end_listings(release_id, inventory_id, seller_discord, ask, note) values (v_copy.release_id, p_inventory, p_user, p_ask, p_note) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_season_end_want(p_user text, p_release uuid, p_design_id text, p_bounty bigint, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_release public.season_end_releases%rowtype; v_id bigint;
begin
  if p_bounty is null or p_bounty < 1 or p_bounty > 100000 or p_design_id is null or p_design_id = '' then raise exception 'invalid Season''s End want'; end if;
  if p_note is not null and char_length(p_note) > 80 then raise exception 'want note is too long'; end if;
  select * into v_release from public.season_end_releases where id = p_release for share;
  if not found or v_release.state <> 'public' then raise exception 'Season''s End release is not public'; end if;
  if not exists (select 1 from public.season_end_designs where release_id = p_release and design_id = p_design_id) then raise exception 'unknown Season''s End design'; end if;
  insert into public.season_end_wants(release_id, design_id, discord_id, bounty, note)
    values (p_release, p_design_id, p_user, p_bounty, p_note) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fill_season_end_want(p_want bigint, p_seller text, p_inventory bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_want public.season_end_wants%rowtype; v_copy public.season_end_inventory%rowtype; v_first text; v_second text; v_balance bigint;
begin
  select * into v_want from public.season_end_wants where id = p_want for update;
  if not found or v_want.status <> 'open' then raise exception 'want is not open'; end if;
  if v_want.discord_id = p_seller then raise exception 'cannot fill your own want'; end if;
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  if not found or v_copy.release_id <> v_want.release_id or v_copy.design_id <> v_want.design_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_seller then raise exception 'Season''s End copy does not match the want'; end if;
  v_first := least(v_want.discord_id, p_seller); v_second := greatest(v_want.discord_id, p_seller);
  perform 1 from public.betting_profiles where discord_id = v_first for update;
  perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = v_want.discord_id;
  if v_balance is null or v_balance < v_want.bounty then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (v_want.discord_id, -v_want.bounty, 'season_end_want', 'season_end_wants', p_want), (p_seller, v_want.bounty, 'season_end_want', 'season_end_wants', p_want);
  update public.betting_profiles set balance = balance - v_want.bounty where discord_id = v_want.discord_id;
  update public.betting_profiles set balance = balance + v_want.bounty where discord_id = p_seller;
  update public.season_end_inventory set discord_id = v_want.discord_id where id = p_inventory;
  update public.season_end_wants set status = 'filled', filled_inventory_id = p_inventory, filled_by = p_seller, decided_at = now() where id = p_want;
  update public.season_end_listings set status = 'cancelled', decided_at = now() where inventory_id = p_inventory and status = 'open';
  insert into public.season_end_provenance(inventory_id, event, discord_id) values (p_inventory, 'sold', v_want.discord_id);
end;
$$;

create or replace function public.buy_season_end_listing(p_listing bigint, p_buyer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_listing public.season_end_listings%rowtype; v_copy public.season_end_inventory%rowtype; v_first text; v_second text; v_balance bigint;
begin
  select * into v_listing from public.season_end_listings where id = p_listing for update;
  if not found or v_listing.status <> 'open' then raise exception 'listing is not open'; end if;
  if v_listing.expires_at <= now() then update public.season_end_listings set status = 'expired', decided_at = now() where id = p_listing; raise exception 'listing expired'; end if;
  if v_listing.seller_discord = p_buyer then raise exception 'cannot buy your own listing'; end if;
  select * into v_copy from public.season_end_inventory where id = v_listing.inventory_id for update;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_listing.seller_discord or v_copy.release_id <> v_listing.release_id then raise exception 'Season''s End copy is no longer owned'; end if;
  v_first := least(v_listing.seller_discord, p_buyer); v_second := greatest(v_listing.seller_discord, p_buyer);
  perform 1 from public.betting_profiles where discord_id = v_first for update;
  perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = p_buyer;
  if v_balance is null or v_balance < v_listing.ask then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (p_buyer, -v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing), (v_listing.seller_discord, v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing);
  update public.betting_profiles set balance = balance - v_listing.ask where discord_id = p_buyer;
  update public.betting_profiles set balance = balance + v_listing.ask where discord_id = v_listing.seller_discord;
  update public.season_end_inventory set discord_id = p_buyer where id = v_copy.id;
  update public.season_end_listings set status = 'sold', buyer_discord = p_buyer, decided_at = now() where id = p_listing;
  update public.season_end_listings set status = 'cancelled', decided_at = now() where inventory_id = v_copy.id and status = 'open' and id <> p_listing;
  insert into public.season_end_provenance(inventory_id, event, discord_id) values (v_copy.id, 'sold', p_buyer);
end;
$$;

create or replace function public.create_season_end_trade(p_from text, p_to text, p_release uuid, p_offered bigint[], p_requested bigint[], p_offered_dollars bigint, p_requested_dollars bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint; v_copy public.season_end_inventory%rowtype; v_inventory bigint; v_lock_ids bigint[]; v_unique_count integer; v_owner text;
begin
  if p_from = p_to or p_offered_dollars is null or p_requested_dollars is null or p_offered_dollars < 0 or p_requested_dollars < 0 or (coalesce(array_length(p_offered, 1), 0) + coalesce(array_length(p_requested, 1), 0) = 0 and p_offered_dollars + p_requested_dollars = 0) then raise exception 'invalid Season''s End trade'; end if;
  if coalesce(array_length(p_offered, 1), 0) <> (select count(distinct x)::integer from unnest(coalesce(p_offered, '{}')::bigint[]) as values(x)) then raise exception 'duplicate offered Season''s End copies'; end if;
  if coalesce(array_length(p_requested, 1), 0) <> (select count(distinct x)::integer from unnest(coalesce(p_requested, '{}')::bigint[]) as values(x)) then raise exception 'duplicate requested Season''s End copies'; end if;
  select count(distinct id)::integer into v_unique_count from unnest(coalesce(p_offered, '{}')::bigint[] || coalesce(p_requested, '{}')::bigint[]) as ids(id);
  if v_unique_count <> coalesce(array_length(p_offered, 1), 0) + coalesce(array_length(p_requested, 1), 0) then raise exception 'the same Season''s End copy cannot be on both sides'; end if;
  select array_agg(id order by id) into v_lock_ids from unnest(coalesce(p_offered, '{}')::bigint[] || coalesce(p_requested, '{}')::bigint[]) as ids(id);
  if v_lock_ids is not null then foreach v_inventory in array v_lock_ids loop
    select * into v_copy from public.season_end_inventory where id = v_inventory for update;
    if not found or v_copy.release_id <> p_release or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' then raise exception 'Season''s End trade copy is unavailable'; end if;
  end loop; end if;
  foreach v_inventory in array (coalesce(p_offered, '{}')::bigint[] || coalesce(p_requested, '{}')::bigint[]) loop
    select * into v_copy from public.season_end_inventory where id = v_inventory and release_id = p_release and mode = 'public' and lifecycle_status = 'active';
    if not found then raise exception 'Season''s End trade copy is unavailable'; end if;
    v_owner := case when v_inventory = any(coalesce(p_offered, '{}')::bigint[]) then p_from else p_to end;
    if v_copy.discord_id <> v_owner then raise exception 'Season''s End trade ownership changed'; end if;
  end loop;
  insert into public.season_end_trades(release_id, from_discord, to_discord, offered_inventory_ids, requested_inventory_ids, offered_dollars, requested_dollars) values (p_release, p_from, p_to, coalesce(p_offered, '{}'), coalesce(p_requested, '{}'), greatest(0, p_offered_dollars), greatest(0, p_requested_dollars)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_trade public.season_end_trades%rowtype; v_id bigint; v_copy public.season_end_inventory%rowtype; v_net bigint; v_payer text; v_payee text; v_first text; v_second text; v_balance bigint; v_lock_ids bigint[];
begin
  select * into v_trade from public.season_end_trades where id = p_trade for update;
  if not found or v_trade.status <> 'pending' or v_trade.to_discord <> p_user then raise exception 'Season''s End trade is not pending'; end if;
  select array_agg(id order by id) into v_lock_ids from unnest(coalesce(v_trade.offered_inventory_ids, '{}')::bigint[] || coalesce(v_trade.requested_inventory_ids, '{}')::bigint[]) as ids(id);
  if v_lock_ids is not null then foreach v_id in array v_lock_ids loop
    select * into v_copy from public.season_end_inventory where id = v_id for update;
    if not found then raise exception 'Season''s End trade is stale'; end if;
  end loop; end if;
  foreach v_id in array coalesce(v_trade.offered_inventory_ids, '{}') loop
    select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.from_discord then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  foreach v_id in array coalesce(v_trade.requested_inventory_ids, '{}') loop
    select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.to_discord then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  v_net := v_trade.offered_dollars - v_trade.requested_dollars;
  v_first := least(v_trade.from_discord, v_trade.to_discord); v_second := greatest(v_trade.from_discord, v_trade.to_discord);
  perform 1 from public.betting_profiles where discord_id = v_first for update; perform 1 from public.betting_profiles where discord_id = v_second for update;
  if v_net <> 0 then
    v_payer := case when v_net > 0 then v_trade.from_discord else v_trade.to_discord end; v_payee := case when v_net > 0 then v_trade.to_discord else v_trade.from_discord end;
    select balance into v_balance from public.betting_profiles where discord_id = v_payer;
    if v_balance < abs(v_net) then raise exception 'insufficient balance'; end if;
    insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (v_payer, -abs(v_net), 'season_end_trade', 'season_end_trades', p_trade), (v_payee, abs(v_net), 'season_end_trade', 'season_end_trades', p_trade);
    update public.betting_profiles set balance = balance - abs(v_net) where discord_id = v_payer; update public.betting_profiles set balance = balance + abs(v_net) where discord_id = v_payee;
  end if;
  update public.season_end_inventory set discord_id = v_trade.to_discord where id = any(v_trade.offered_inventory_ids);
  update public.season_end_inventory set discord_id = v_trade.from_discord where id = any(v_trade.requested_inventory_ids);
  update public.season_end_trades set status = 'accepted', decided_at = now() where id = p_trade;
  foreach v_id in array (coalesce(v_trade.offered_inventory_ids, '{}')::bigint[] || coalesce(v_trade.requested_inventory_ids, '{}')::bigint[]) loop insert into public.season_end_provenance(inventory_id, event, discord_id) values (v_id, 'traded', case when v_id = any(v_trade.offered_inventory_ids) then v_trade.to_discord else v_trade.from_discord end); end loop;
end;
$$;

create or replace function public.cancel_season_end_listing(p_listing bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_end_listings set status = 'cancelled', decided_at = now()
   where id = p_listing and seller_discord = p_user and status = 'open';
  if not found then raise exception 'listing is not open'; end if;
end;
$$;

create or replace function public.cancel_season_end_want(p_want bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_end_wants set status = 'cancelled', decided_at = now()
   where id = p_want and discord_id = p_user and status = 'open';
  if not found then raise exception 'want is not open'; end if;
end;
$$;

create or replace function public.decline_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_end_trades set status = 'declined', decided_at = now()
   where id = p_trade and to_discord = p_user and status = 'pending';
  if not found then raise exception 'Season''s End trade is not pending'; end if;
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
  v_season integer;
  v_best_of integer;
  v_accolade integer;
  v_opening_ids jsonb;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found or v_release.state <> 'admin_test' then raise exception 'release is not in admin test'; end if;
  select count(*) filter (where kind = 'season'), count(*) filter (where kind = 'best_of'), count(*) filter (where kind = 'accolade') into v_season, v_best_of, v_accolade from public.season_end_designs where release_id = p_release;
  if v_season < 2 or v_best_of < 2 or v_accolade < 2 or v_release.catalog_hash = '' or v_release.revision_digest = '' or v_release.signature_calibration is null or v_release.economy_payload = '{}'::jsonb then raise exception 'test approval requires a complete locked catalog'; end if;
  select coalesce(jsonb_agg(opening_id order by fulfilled_at), '[]'::jsonb) into v_opening_ids from public.season_end_openings where release_id = p_release and mode = 'admin_test' and status = 'fulfilled';
  if jsonb_array_length(v_opening_ids) = 0 then raise exception 'test approval requires a successful admin opening'; end if;
  update public.season_end_releases set test_approved_at = now(), test_approved_by = p_actor, verification_report = jsonb_build_object('revisionDigest', v_release.revision_digest, 'simulatorVersion', 'season-end-simulator-v1', 'actor', p_actor, 'successfulOpeningIds', v_opening_ids, 'recordedAt', now()), updated_by = p_actor, updated_at = now() where id = p_release;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash) values (p_release, p_actor, 'test_approved', v_release.state, v_release.state, v_release.catalog_hash);
end;
$$;

create or replace function public.transition_season_end_release(p_release uuid, p_state text, p_actor text, p_catalog_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_release public.season_end_releases%rowtype; v_season integer; v_best_of integer; v_accolade integer;
begin
  if p_state not in ('admin_test', 'public') then raise exception 'invalid Season''s End state'; end if;
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if p_catalog_hash = '' or p_catalog_hash <> v_release.catalog_hash then raise exception 'catalog hash mismatch'; end if;
  if p_state = 'admin_test' then
    if v_release.state <> 'draft' then raise exception 'release must start in draft'; end if;
    select count(*) filter (where kind = 'season'), count(*) filter (where kind = 'best_of'), count(*) filter (where kind = 'accolade') into v_season, v_best_of, v_accolade from public.season_end_designs where release_id = p_release;
    if v_season < 2 or v_best_of < 2 or v_accolade < 2 or v_release.revision_digest = '' then raise exception 'release cannot be locked until the complete revision is saved'; end if;
    update public.season_end_releases set state = 'admin_test', locked_at = now(), locked_by = p_actor, updated_by = p_actor, updated_at = now() where id = p_release;
  else
    if v_release.state <> 'admin_test' or v_release.test_approved_at is null or coalesce(v_release.verification_report ->> 'revisionDigest', '') <> v_release.revision_digest then raise exception 'public release requires approval for this exact revision'; end if;
    update public.season_end_releases set state = 'public', published_at = coalesce(published_at, now()), updated_by = p_actor, updated_at = now() where id = p_release;
  end if;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash) values (p_release, p_actor, 'state_changed', v_release.state, p_state, p_catalog_hash);
end;
$$;

create or replace function public.pause_season_end_release(p_release uuid, p_paused boolean, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_release public.season_end_releases%rowtype;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found or v_release.state = 'draft' then raise exception 'only locked Season''s End releases can be paused'; end if;
  update public.season_end_releases set paused = p_paused, updated_by = p_actor, updated_at = now() where id = p_release;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash) values (p_release, p_actor, case when p_paused then 'paused' else 'resumed' end, v_release.state, v_release.state, v_release.catalog_hash);
end;
$$;

revoke all on function public.replace_season_end_draft_catalog(uuid, text, text, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.season_end_dust_quote(text, bigint) from public, anon, authenticated;
revoke all on function public.dust_season_end_copy(text, bigint) from public, anon, authenticated;
revoke all on function public.create_season_end_listing(text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.buy_season_end_listing(bigint, text) from public, anon, authenticated;
revoke all on function public.create_season_end_want(text, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.fill_season_end_want(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.create_season_end_trade(text, text, uuid, bigint[], bigint[], bigint, bigint) from public, anon, authenticated;
revoke all on function public.accept_season_end_trade(bigint, text) from public, anon, authenticated;
revoke all on function public.cancel_season_end_listing(bigint, text) from public, anon, authenticated;
revoke all on function public.cancel_season_end_want(bigint, text) from public, anon, authenticated;
revoke all on function public.decline_season_end_trade(bigint, text) from public, anon, authenticated;
revoke all on function public.approve_season_end_release(uuid, text) from public, anon, authenticated;
revoke all on function public.transition_season_end_release(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.pause_season_end_release(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.replace_season_end_draft_catalog(uuid, text, text, text, text, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) to service_role;
revoke all on function public.begin_season_end_opening(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_season_end_opening(uuid, text, uuid, text) to service_role;
grant execute on function public.season_end_dust_quote(text, bigint) to service_role;
grant execute on function public.dust_season_end_copy(text, bigint) to service_role;
grant execute on function public.create_season_end_listing(text, bigint, bigint, text) to service_role;
grant execute on function public.buy_season_end_listing(bigint, text) to service_role;
grant execute on function public.create_season_end_want(text, uuid, text, bigint, text) to service_role;
grant execute on function public.fill_season_end_want(bigint, text, bigint) to service_role;
grant execute on function public.create_season_end_trade(text, text, uuid, bigint[], bigint[], bigint, bigint) to service_role;
grant execute on function public.accept_season_end_trade(bigint, text) to service_role;
grant execute on function public.cancel_season_end_listing(bigint, text) to service_role;
grant execute on function public.cancel_season_end_want(bigint, text) to service_role;
grant execute on function public.decline_season_end_trade(bigint, text) to service_role;
grant execute on function public.approve_season_end_release(uuid, text) to service_role;
grant execute on function public.transition_season_end_release(uuid, text, text, text) to service_role;
grant execute on function public.pause_season_end_release(uuid, boolean, text) to service_role;
