-- Season's End follow-up hardening.
--
-- This migration is append-only. It closes the remaining contract, evidence,
-- ownership-version and lock-order gaps without rewriting existing releases
-- or copies.

alter table public.season_end_openings
  add column if not exists rules_payload jsonb not null default '{}'::jsonb;

alter table public.season_end_inventory
  add column if not exists ownership_version bigint not null default 0;

alter table public.season_end_listings
  add column if not exists owner_version bigint not null default 0;

alter table public.season_end_trades
  add column if not exists offered_ownership_versions bigint[] not null default '{}',
  add column if not exists requested_ownership_versions bigint[] not null default '{}',
  add column if not exists expires_at timestamptz not null default now() + interval '14 days';

update public.season_end_listings listing
   set owner_version = inventory.ownership_version
  from public.season_end_inventory inventory
 where inventory.id = listing.inventory_id;

update public.season_end_trades trade
   set offered_ownership_versions = coalesce((
         select array_agg(inventory.ownership_version order by ids.ordinality)
           from unnest(trade.offered_inventory_ids) with ordinality ids(id, ordinality)
           join public.season_end_inventory inventory on inventory.id = ids.id
       ), '{}'),
       requested_ownership_versions = coalesce((
         select array_agg(inventory.ownership_version order by ids.ordinality)
           from unnest(trade.requested_inventory_ids) with ordinality ids(id, ordinality)
           join public.season_end_inventory inventory on inventory.id = ids.id
       ), '{}');

create index if not exists season_end_trades_expiry_idx
  on public.season_end_trades (release_id, status, expires_at);

-- The trigger locks both parents and checks both sides of a move. A locked
-- release therefore cannot be escaped by moving a design to a draft parent.
create or replace function public.protect_season_end_locked_design()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_state text;
begin
  if tg_op <> 'INSERT' then
    select state into v_state
      from public.season_end_releases
     where id = old.release_id
     for share;
    if v_state is distinct from 'draft' then
      raise exception 'Season''s End designs are immutable after lock';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    select state into v_state
      from public.season_end_releases
     where id = new.release_id
     for share;
    if v_state is distinct from 'draft' then
      raise exception 'Season''s End designs are immutable after lock';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- Every opening carries the exact numeric rule payload it was charged under.
drop function if exists public.begin_season_end_opening(uuid, text, uuid, text);
create function public.begin_season_end_opening(
  p_request_id uuid,
  p_user text,
  p_release uuid,
  p_mode text
)
returns table(opening_id uuid, status text, price bigint, mode text, test_balance bigint, outcome jsonb)
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
  if p_request_id is null or p_mode not in ('admin_test', 'public') then
    raise exception 'invalid Season''s End opening input';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user || ':' || p_request_id::text, 0));
  select * into v_existing from public.season_end_openings
   where discord_id = p_user and request_id = p_request_id for update;
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
  if v_release.state not in ('admin_test', 'public') or v_release.catalog_hash = '' or v_release.revision_digest = '' then
    raise exception 'Season''s End release is not locked';
  end if;
  if p_mode = 'public' and v_release.state <> 'public' then raise exception 'Season''s End release is not public'; end if;
  if p_mode = 'admin_test' and v_release.state <> 'admin_test' then raise exception 'Season''s End release is not in admin test mode'; end if;

  if p_mode = 'admin_test' then
    insert into public.season_end_test_wallets (release_id, discord_id)
      values (v_release.id, p_user) on conflict (release_id, discord_id) do nothing;
    select * into v_wallet from public.season_end_test_wallets
      where release_id = v_release.id and discord_id = p_user for update;
    if v_wallet.balance < v_release.price then raise exception 'insufficient Season''s End test balance'; end if;
    update public.season_end_test_wallets set balance = balance - v_release.price, updated_at = now()
      where release_id = v_release.id and discord_id = p_user;
  else
    v_pack_open := public.open_card_pack(p_user, v_release.season, v_release.price);
  end if;

  insert into public.season_end_openings
    (request_id, discord_id, release_id, mode, price, pack_open_id, test_balance_after,
     revision_digest, economy_version, economy_payload, signing_book, rules_version, rules_payload)
  values
    (p_request_id, p_user, v_release.id, p_mode, v_release.price, v_pack_open,
     case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end,
     v_release.revision_digest, v_release.economy_version, v_release.economy_payload,
     v_release.signing_book, v_release.rules_version, v_release.rules_payload)
  returning season_end_openings.opening_id into opening_id;
  status := 'pending'; price := v_release.price; mode := p_mode;
  test_balance := case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end;
  outcome := null;
  return next;
end;
$$;

-- Verification reports are durable evidence, not a value fabricated during
-- approval. The JSON contract is deliberately explicit so malformed or
-- incomplete simulator output cannot satisfy publication.
create table if not exists public.season_end_release_reports (
  id              uuid primary key default gen_random_uuid(),
  release_id      uuid not null references public.season_end_releases(id) on delete restrict,
  revision_digest text not null,
  report_digest   text not null check (report_digest ~ '^[0-9a-f]{64}$'),
  report          jsonb not null,
  recorded_by     text not null,
  recorded_at     timestamptz not null default now(),
  unique (release_id, revision_digest, report_digest)
);

alter table public.season_end_release_reports enable row level security;
revoke all on table public.season_end_release_reports from anon, authenticated;
grant all on table public.season_end_release_reports to service_role;

create or replace function public.record_season_end_verification_report(
  p_release uuid,
  p_revision_digest text,
  p_report_digest text,
  p_report jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_id uuid;
begin
  select * into v_release from public.season_end_releases where id = p_release for share;
  if not found or v_release.state <> 'admin_test' then raise exception 'verification reports require an admin-test release'; end if;
  if p_revision_digest is null or p_revision_digest <> v_release.revision_digest then raise exception 'verification report revision mismatch'; end if;
  if p_report_digest is null or p_report_digest !~ '^[0-9a-f]{64}$' then raise exception 'verification report digest is invalid'; end if;
  if jsonb_typeof(p_report) <> 'object' then raise exception 'verification report must be an object'; end if;
  if coalesce(p_report ->> 'reportVersion', '') = '' or p_report ->> 'reportDigest' <> p_report_digest then raise exception 'verification report identity is incomplete'; end if;
  if p_report ->> 'revisionDigest' <> v_release.revision_digest or p_report ->> 'catalogHash' <> v_release.catalog_hash then raise exception 'verification report inputs do not match the release'; end if;
  if jsonb_typeof(p_report -> 'inputDigest') <> 'string' or length(p_report ->> 'inputDigest') <> 64 then raise exception 'verification report input digest is missing'; end if;
  if jsonb_typeof(p_report -> 'sampleSizes') <> 'object' or jsonb_typeof(p_report -> 'scenarios') <> 'object' then raise exception 'verification report sample and scenario evidence is missing'; end if;
  if jsonb_typeof(p_report -> 'acceptance') <> 'object' then raise exception 'verification report acceptance evidence is missing'; end if;
  if p_report -> 'acceptance' ->> 'status' <> 'passed' or p_report -> 'acceptance' ->> 'signatureGatePassed' <> 'true' or p_report -> 'acceptance' ->> 'salvageGatePassed' <> 'true' then raise exception 'verification report acceptance gates did not pass'; end if;
  if jsonb_typeof(p_report -> 'acceptance' -> 'maximumPatronSalvageUpperBound') <> 'number' or (p_report -> 'acceptance' ->> 'maximumPatronSalvageUpperBound')::numeric > v_release.price * 0.5 then raise exception 'maximum patron salvage bound exceeds half the pack price'; end if;
  if jsonb_typeof(p_report -> 'acceptance' -> 'exactRevisionOpeningCount') <> 'number' or (p_report -> 'acceptance' ->> 'exactRevisionOpeningCount')::integer < 1 then raise exception 'verification report lacks an exact-revision opening'; end if;
  insert into public.season_end_release_reports (release_id, revision_digest, report_digest, report, recorded_by)
    values (p_release, p_revision_digest, p_report_digest, p_report, p_actor)
    on conflict (release_id, revision_digest, report_digest) do update set report = excluded.report, recorded_by = excluded.recorded_by, recorded_at = now()
    returning id into v_id;
  return v_id;
end;
$$;

drop function if exists public.approve_season_end_release(uuid, text);
create function public.approve_season_end_release(p_release uuid, p_actor text, p_revision_digest text)
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
  v_report public.season_end_release_reports%rowtype;
  v_opening_count integer;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found or v_release.state <> 'admin_test' then raise exception 'release is not in admin test'; end if;
  if p_revision_digest is null or p_revision_digest <> v_release.revision_digest then raise exception 'approval revision mismatch'; end if;
  select count(*) filter (where kind = 'season'), count(*) filter (where kind = 'best_of'), count(*) filter (where kind = 'accolade')
    into v_season, v_best_of, v_accolade from public.season_end_designs where release_id = p_release;
  if v_season < 2 or v_best_of < 2 or v_accolade < 2 or v_release.catalog_hash = '' or v_release.revision_digest = '' or v_release.signature_calibration is null or v_release.economy_payload = '{}'::jsonb then
    raise exception 'test approval requires a complete locked catalog';
  end if;
  select * into v_report from public.season_end_release_reports
   where release_id = p_release and revision_digest = v_release.revision_digest
     and report -> 'acceptance' ->> 'status' = 'passed'
   order by recorded_at desc limit 1;
  if not found then raise exception 'test approval requires a passing verification report'; end if;
  if (v_report.report -> 'acceptance' ->> 'maximumPatronSalvageUpperBound')::numeric > v_release.price * 0.5 then raise exception 'verification report salvage bound exceeds the release gate'; end if;
  select count(*) into v_opening_count from public.season_end_openings
   where release_id = p_release and mode = 'admin_test' and status = 'fulfilled' and revision_digest = v_release.revision_digest;
  if v_opening_count < (v_report.report -> 'acceptance' ->> 'exactRevisionOpeningCount')::integer then raise exception 'verification report cites openings from another revision'; end if;
  update public.season_end_releases
     set test_approved_at = now(), test_approved_by = p_actor,
         verification_report = jsonb_build_object('reportId', v_report.id, 'reportDigest', v_report.report_digest, 'revisionDigest', v_report.revision_digest, 'recordedBy', v_report.recorded_by, 'recordedAt', v_report.recorded_at),
         updated_by = p_actor, updated_at = now()
   where id = p_release;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash)
    values (p_release, p_actor, 'test_approved', v_release.state, v_release.state, v_release.catalog_hash);
end;
$$;

drop function if exists public.transition_season_end_release(uuid, text, text, text);
create function public.transition_season_end_release(p_release uuid, p_state text, p_actor text, p_catalog_hash text, p_revision_digest text)
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
  if p_catalog_hash = '' or p_catalog_hash <> v_release.catalog_hash or p_revision_digest = '' or p_revision_digest <> v_release.revision_digest then raise exception 'release revision mismatch'; end if;
  if p_state = 'admin_test' then
    if v_release.state <> 'draft' then raise exception 'release must start in draft'; end if;
    select count(*) filter (where kind = 'season'), count(*) filter (where kind = 'best_of'), count(*) filter (where kind = 'accolade') into v_season, v_best_of, v_accolade from public.season_end_designs where release_id = p_release;
    if v_season < 2 or v_best_of < 2 or v_accolade < 2 then raise exception 'release cannot be locked until every family has two designs'; end if;
    update public.season_end_releases set state = 'admin_test', locked_at = now(), locked_by = p_actor, updated_by = p_actor, updated_at = now() where id = p_release;
  else
    if v_release.state <> 'admin_test' or v_release.test_approved_at is null or coalesce(v_release.verification_report ->> 'revisionDigest', '') <> v_release.revision_digest then raise exception 'public release requires approval for this exact revision'; end if;
    update public.season_end_releases set state = 'public', published_at = coalesce(published_at, now()), updated_by = p_actor, updated_at = now() where id = p_release;
  end if;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash) values (p_release, p_actor, 'state_changed', v_release.state, p_state, p_catalog_hash);
end;
$$;

-- Common cancellation boundary. All callers lock the copy first, then the
-- dependent promises, then wallets. The ownership version makes a promise
-- stale even if a copy leaves and later returns to the original owner.
create or replace function public.cancel_season_end_copy_promises(p_inventory bigint, p_keep_trade bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.season_end_listings set status = 'cancelled', decided_at = now()
   where inventory_id = p_inventory and status = 'open';
  update public.season_end_trades set status = 'cancelled', decided_at = now()
   where status = 'pending' and (p_keep_trade is null or id <> p_keep_trade)
     and (p_inventory = any(offered_inventory_ids) or p_inventory = any(requested_inventory_ids));
end;
$$;

create or replace function public.season_end_dust_quote(p_user text, p_inventory bigint)
returns table(value bigint, patron boolean, balance bigint)
language plpgsql security definer set search_path = public
as $$
declare v_copy public.season_end_inventory%rowtype; v_release public.season_end_releases%rowtype; v_base numeric; v_multiplier numeric := 1; v_patron boolean; v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for share;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  select * into v_release from public.season_end_releases where id = v_copy.release_id;
  v_base := coalesce((select base_salvage from public.season_end_designs where release_id = v_copy.release_id and design_id = v_copy.design_id), 0);
  if v_copy.foil_type is not null then v_multiplier := coalesce((v_release.economy_payload -> 'foilDustMultipliers' ->> v_copy.foil_type)::numeric, 1); end if;
  v_patron := exists (select 1 from public.betting_profiles where discord_id = p_user and patron_until > now());
  select betting_profiles.balance into v_balance from public.betting_profiles where discord_id = p_user;
  return query select round((v_base * v_multiplier + case when v_copy.signed then coalesce((v_release.economy_payload ->> 'signatureBonus')::numeric, 0) else 0 end) * case when v_patron then coalesce((v_release.economy_payload ->> 'patronMultiplier')::numeric, 1) else 1 end)::bigint, v_patron, v_balance;
end;
$$;

create or replace function public.dust_season_end_copy(p_user text, p_inventory bigint)
returns table(value bigint, balance bigint)
language plpgsql security definer set search_path = public
as $$
declare v_copy public.season_end_inventory%rowtype; v_quote record; v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  perform 1 from public.season_end_listings where inventory_id = p_inventory and status = 'open' for update;
  perform 1 from public.season_end_trades where status = 'pending' and (p_inventory = any(offered_inventory_ids) or p_inventory = any(requested_inventory_ids)) for update;
  select * into v_quote from public.season_end_dust_quote(p_user, p_inventory);
  perform 1 from public.betting_profiles where discord_id = p_user for update;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (p_user, v_quote.value, 'season_end_dust', 'season_end_inventory', p_inventory);
  update public.betting_profiles set balance = betting_profiles.balance + v_quote.value where discord_id = p_user returning betting_profiles.balance into v_balance;
  update public.season_end_inventory set lifecycle_status = 'dusted', ownership_version = ownership_version + 1 where id = p_inventory;
  perform public.cancel_season_end_copy_promises(p_inventory);
  insert into public.season_end_provenance (inventory_id, event, discord_id) values (p_inventory, 'dusted', p_user);
  return query select v_quote.value, v_balance;
end;
$$;

create or replace function public.create_season_end_listing(p_user text, p_inventory bigint, p_ask bigint, p_note text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_copy public.season_end_inventory%rowtype; v_id bigint;
begin
  if p_ask < 1 or p_ask > 100000 then raise exception 'invalid sale price'; end if;
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  if not found or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_user then raise exception 'Season''s End copy is not available'; end if;
  if p_note is not null and char_length(p_note) > 80 then raise exception 'listing note is too long'; end if;
  update public.season_end_listings set status = 'expired', decided_at = now() where inventory_id = p_inventory and status = 'open' and expires_at <= now();
  insert into public.season_end_listings(release_id, inventory_id, seller_discord, owner_version, ask, note) values (v_copy.release_id, p_inventory, p_user, v_copy.ownership_version, p_ask, p_note) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fill_season_end_want(p_want bigint, p_seller text, p_inventory bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_want public.season_end_wants%rowtype; v_copy public.season_end_inventory%rowtype; v_first text; v_second text; v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  select * into v_want from public.season_end_wants where id = p_want for update;
  if not found or v_want.status <> 'open' then raise exception 'want is not open'; end if;
  if v_want.discord_id = p_seller then raise exception 'cannot fill your own want'; end if;
  if v_copy.release_id <> v_want.release_id or v_copy.design_id <> v_want.design_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_seller then raise exception 'Season''s End copy does not match the want'; end if;
  v_first := least(v_want.discord_id, p_seller); v_second := greatest(v_want.discord_id, p_seller);
  perform 1 from public.betting_profiles where discord_id = v_first for update; perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = v_want.discord_id;
  if v_balance is null or v_balance < v_want.bounty then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (v_want.discord_id, -v_want.bounty, 'season_end_want', 'season_end_wants', p_want), (p_seller, v_want.bounty, 'season_end_want', 'season_end_wants', p_want);
  update public.betting_profiles set balance = balance - v_want.bounty where discord_id = v_want.discord_id;
  update public.betting_profiles set balance = balance + v_want.bounty where discord_id = p_seller;
  update public.season_end_inventory set discord_id = v_want.discord_id, ownership_version = ownership_version + 1 where id = p_inventory;
  update public.season_end_wants set status = 'filled', filled_inventory_id = p_inventory, filled_by = p_seller, decided_at = now() where id = p_want;
  perform public.cancel_season_end_copy_promises(p_inventory);
  insert into public.season_end_provenance(inventory_id, event, discord_id) values (p_inventory, 'sold', v_want.discord_id);
end;
$$;

create or replace function public.buy_season_end_listing(p_listing bigint, p_buyer text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_listing public.season_end_listings%rowtype; v_copy public.season_end_inventory%rowtype; v_inventory_id bigint; v_first text; v_second text; v_balance bigint;
begin
  select inventory_id into v_inventory_id from public.season_end_listings where id = p_listing;
  if v_inventory_id is null then raise exception 'listing is not open'; end if;
  select * into v_copy from public.season_end_inventory where id = v_inventory_id for update;
  if not found then raise exception 'Season''s End copy is no longer owned'; end if;
  select * into v_listing from public.season_end_listings where id = p_listing for update;
  if not found or v_listing.status <> 'open' or v_listing.expires_at <= now() then raise exception 'listing expired or not open'; end if;
  if v_listing.seller_discord = p_buyer then raise exception 'cannot buy your own listing'; end if;
  if v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_listing.seller_discord or v_copy.release_id <> v_listing.release_id or v_copy.ownership_version <> v_listing.owner_version then raise exception 'Season''s End copy is no longer owned'; end if;
  v_first := least(v_listing.seller_discord, p_buyer); v_second := greatest(v_listing.seller_discord, p_buyer);
  perform 1 from public.betting_profiles where discord_id = v_first for update; perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = p_buyer;
  if v_balance is null or v_balance < v_listing.ask then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (p_buyer, -v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing), (v_listing.seller_discord, v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing);
  update public.betting_profiles set balance = balance - v_listing.ask where discord_id = p_buyer;
  update public.betting_profiles set balance = balance + v_listing.ask where discord_id = v_listing.seller_discord;
  update public.season_end_inventory set discord_id = p_buyer, ownership_version = ownership_version + 1 where id = v_copy.id;
  update public.season_end_listings set status = 'sold', buyer_discord = p_buyer, decided_at = now() where id = p_listing;
  perform public.cancel_season_end_copy_promises(v_copy.id);
  insert into public.season_end_provenance(inventory_id, event, discord_id) values (v_copy.id, 'sold', p_buyer);
end;
$$;

create or replace function public.create_season_end_trade(p_from text, p_to text, p_release uuid, p_offered bigint[], p_requested bigint[], p_offered_dollars bigint, p_requested_dollars bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_id bigint; v_copy public.season_end_inventory%rowtype; v_inventory bigint; v_lock_ids bigint[]; v_unique_count integer; v_owner text; v_offered_versions bigint[] := '{}'; v_requested_versions bigint[] := '{}'; v_release public.season_end_releases%rowtype;
begin
  if p_from = p_to or p_offered_dollars is null or p_requested_dollars is null or p_offered_dollars < 0 or p_requested_dollars < 0 or (coalesce(array_length(p_offered, 1), 0) + coalesce(array_length(p_requested, 1), 0) = 0 and p_offered_dollars + p_requested_dollars = 0) then raise exception 'invalid Season''s End trade'; end if;
  select * into v_release from public.season_end_releases where id = p_release for share;
  if not found or v_release.state <> 'public' or v_release.paused then raise exception 'Season''s End release is not public'; end if;
  if coalesce(array_length(p_offered, 1), 0) <> (select count(distinct offered_id)::integer from unnest(coalesce(p_offered, '{}')::bigint[]) as offered_ids(offered_id)) then raise exception 'duplicate offered Season''s End copies'; end if;
  if coalesce(array_length(p_requested, 1), 0) <> (select count(distinct requested_id)::integer from unnest(coalesce(p_requested, '{}')::bigint[]) as requested_ids(requested_id)) then raise exception 'duplicate requested Season''s End copies'; end if;
  select count(distinct id)::integer into v_unique_count from unnest(coalesce(p_offered, '{}')::bigint[] || coalesce(p_requested, '{}')::bigint[]) as ids(id);
  if v_unique_count <> coalesce(array_length(p_offered, 1), 0) + coalesce(array_length(p_requested, 1), 0) then raise exception 'the same Season''s End copy cannot be on both sides'; end if;
  select array_agg(id order by id) into v_lock_ids from unnest(coalesce(p_offered, '{}')::bigint[] || coalesce(p_requested, '{}')::bigint[]) ids(id);
  if v_lock_ids is not null then foreach v_inventory in array v_lock_ids loop
    select * into v_copy from public.season_end_inventory where id = v_inventory for update;
    if not found or v_copy.release_id <> p_release or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' then raise exception 'Season''s End trade copy is unavailable'; end if;
    v_owner := case when v_inventory = any(coalesce(p_offered, '{}')::bigint[]) then p_from else p_to end;
    if v_copy.discord_id <> v_owner then raise exception 'Season''s End trade ownership changed'; end if;
  end loop; end if;
  select coalesce(array_agg(inventory.ownership_version order by ids.ordinality), '{}') into v_offered_versions
    from unnest(coalesce(p_offered, '{}')::bigint[]) with ordinality ids(id, ordinality)
    join public.season_end_inventory inventory on inventory.id = ids.id;
  select coalesce(array_agg(inventory.ownership_version order by ids.ordinality), '{}') into v_requested_versions
    from unnest(coalesce(p_requested, '{}')::bigint[]) with ordinality ids(id, ordinality)
    join public.season_end_inventory inventory on inventory.id = ids.id;
  insert into public.season_end_trades(release_id, from_discord, to_discord, offered_inventory_ids, requested_inventory_ids, offered_ownership_versions, requested_ownership_versions, offered_dollars, requested_dollars)
    values (p_release, p_from, p_to, coalesce(p_offered, '{}'), coalesce(p_requested, '{}'), v_offered_versions, v_requested_versions, greatest(0, p_offered_dollars), greatest(0, p_requested_dollars)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.accept_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_trade public.season_end_trades%rowtype; v_id bigint; v_copy public.season_end_inventory%rowtype; v_net bigint; v_payer text; v_payee text; v_first text; v_second text; v_balance bigint; v_lock_ids bigint[]; v_index integer;
begin
  select offered_inventory_ids || requested_inventory_ids into v_lock_ids from public.season_end_trades where id = p_trade;
  select array_agg(id order by id) into v_lock_ids from unnest(coalesce(v_lock_ids, '{}')) ids(id);
  if v_lock_ids is not null then foreach v_id in array v_lock_ids loop select * into v_copy from public.season_end_inventory where id = v_id for update; if not found then raise exception 'Season''s End trade is stale'; end if; end loop; end if;
  select * into v_trade from public.season_end_trades where id = p_trade for update;
  if not found or v_trade.status <> 'pending' or v_trade.to_discord <> p_user or v_trade.expires_at <= now() then raise exception 'Season''s End trade is not pending'; end if;
  v_index := 0;
  foreach v_id in array coalesce(v_trade.offered_inventory_ids, '{}') loop
    v_index := v_index + 1; select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.from_discord or v_copy.ownership_version <> v_trade.offered_ownership_versions[v_index] then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  v_index := 0;
  foreach v_id in array coalesce(v_trade.requested_inventory_ids, '{}') loop
    v_index := v_index + 1; select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.to_discord or v_copy.ownership_version <> v_trade.requested_ownership_versions[v_index] then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  v_net := v_trade.offered_dollars - v_trade.requested_dollars; v_first := least(v_trade.from_discord, v_trade.to_discord); v_second := greatest(v_trade.from_discord, v_trade.to_discord);
  perform 1 from public.betting_profiles where discord_id = v_first for update; perform 1 from public.betting_profiles where discord_id = v_second for update;
  if v_net <> 0 then v_payer := case when v_net > 0 then v_trade.from_discord else v_trade.to_discord end; v_payee := case when v_net > 0 then v_trade.to_discord else v_trade.from_discord end; select balance into v_balance from public.betting_profiles where discord_id = v_payer; if v_balance < abs(v_net) then raise exception 'insufficient balance'; end if; insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id) values (v_payer, -abs(v_net), 'season_end_trade', 'season_end_trades', p_trade), (v_payee, abs(v_net), 'season_end_trade', 'season_end_trades', p_trade); update public.betting_profiles set balance = balance - abs(v_net) where discord_id = v_payer; update public.betting_profiles set balance = balance + abs(v_net) where discord_id = v_payee; end if;
  update public.season_end_inventory set discord_id = v_trade.to_discord, ownership_version = ownership_version + 1 where id = any(v_trade.offered_inventory_ids);
  update public.season_end_inventory set discord_id = v_trade.from_discord, ownership_version = ownership_version + 1 where id = any(v_trade.requested_inventory_ids);
  update public.season_end_trades set status = 'accepted', decided_at = now() where id = p_trade;
  foreach v_id in array (coalesce(v_trade.offered_inventory_ids, '{}') || coalesce(v_trade.requested_inventory_ids, '{}')) loop perform public.cancel_season_end_copy_promises(v_id, p_trade); insert into public.season_end_provenance(inventory_id, event, discord_id) values (v_id, 'traded', case when v_id = any(v_trade.offered_inventory_ids) then v_trade.to_discord else v_trade.from_discord end); end loop;
end;
$$;

-- Keep the pre-follow-up RPC signatures callable for already deployed staff
-- tooling. These wrappers still route through the exact-revision gates above;
-- they only read the current immutable digest for source compatibility.
create or replace function public.approve_season_end_release(p_release uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_revision text;
begin
  select revision_digest into v_revision from public.season_end_releases where id = p_release;
  perform public.approve_season_end_release(p_release, p_actor, v_revision);
end;
$$;

create or replace function public.transition_season_end_release(p_release uuid, p_state text, p_actor text, p_catalog_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_revision text;
begin
  select revision_digest into v_revision from public.season_end_releases where id = p_release;
  perform public.transition_season_end_release(p_release, p_state, p_actor, p_catalog_hash, v_revision);
end;
$$;

revoke all on function public.record_season_end_verification_report(uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.record_season_end_verification_report(uuid,text,text,jsonb,text) to service_role;
revoke all on function public.cancel_season_end_copy_promises(bigint,bigint) from public, anon, authenticated;
grant execute on function public.cancel_season_end_copy_promises(bigint,bigint) to service_role;
revoke all on function public.approve_season_end_release(uuid,text) from public, anon, authenticated;
revoke all on function public.transition_season_end_release(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.approve_season_end_release(uuid,text,text) from public, anon, authenticated;
revoke all on function public.transition_season_end_release(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.approve_season_end_release(uuid,text) to service_role;
grant execute on function public.transition_season_end_release(uuid,text,text,text) to service_role;
grant execute on function public.approve_season_end_release(uuid,text,text) to service_role;
grant execute on function public.transition_season_end_release(uuid,text,text,text,text) to service_role;
