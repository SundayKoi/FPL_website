-- Season's End publication, recovery, and commerce hardening.
--
-- This migration is intentionally forward-only. It repairs grants lost when
-- the charge RPC was dropped/recreated, makes the simulator envelope a real
-- immutable evidence contract, and gives every copy/promise/wallet path one
-- lock order: copies -> promises -> wallets.

create extension if not exists pgcrypto with schema extensions;

-- A dropped SECURITY DEFINER function gets PUBLIC execution privileges again.
-- The service action performs the session and staff checks before calling this
-- RPC; the database boundary must still reject direct Data API callers.
revoke all on function public.begin_season_end_opening(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_season_end_opening(uuid, text, uuid, text) to service_role;

-- Canonical JSON is sorted recursively so the report digest is independent of
-- the property order in the pasted/exported envelope. Numeric JSONB values are
-- normalized through PostgreSQL numeric text. The application expands
-- JavaScript exponent notation into the same plain decimal representation
-- before hashing, avoiding float8 rounding/formatting differences between the
-- two runtimes.
create or replace function public.season_end_canonical_json(p_value jsonb)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select case jsonb_typeof(p_value)
    when 'object' then
      '{' || coalesce((
        select string_agg(to_jsonb(key)::text || ':' || public.season_end_canonical_json(value), ',' order by key collate "C")
          from jsonb_each(p_value)
      ), '') || '}'
    when 'array' then
      '[' || coalesce((
        select string_agg(public.season_end_canonical_json(value), ',' order by ordinality)
          from jsonb_array_elements(p_value) with ordinality
      ), '') || ']'
    when 'number' then trim_scale((p_value #>> '{}')::numeric)::text
    else p_value::text
  end;
$$;

-- Validate both the shape and the measured values. Approval calls this again
-- after selecting the durable row, so recording a report is not the only
-- point at which its claims are checked.
create or replace function public.validate_season_end_verification_report(
  p_release uuid,
  p_report jsonb,
  p_report_digest text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_evidence jsonb;
  v_samples jsonb;
  v_scenarios jsonb;
  v_acceptance jsonb;
  v_scenario jsonb;
  v_patron_scenario jsonb;
  v_name text;
  v_expected_patron boolean;
  v_sample_openings numeric;
  v_min_trajectories numeric;
  v_actual_openings integer;
  v_reported_openings numeric;
  v_target numeric;
  v_tolerance numeric;
  v_value numeric;
begin
  select * into v_release
    from public.season_end_releases
   where id = p_release
   for share;
  if not found or v_release.state <> 'admin_test' then
    raise exception 'verification reports require an admin-test release';
  end if;
  if p_report is null or jsonb_typeof(p_report) is distinct from 'object' then
    raise exception 'verification report envelope must be an object';
  end if;
  if jsonb_typeof(p_report -> 'reportDigest') is distinct from 'string'
     or p_report ->> 'reportDigest' is distinct from p_report_digest
     or p_report_digest is null
     or p_report_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'verification report digest is invalid';
  end if;
  if jsonb_typeof(p_report -> 'evidence') is distinct from 'object' then
    raise exception 'verification report evidence payload is missing';
  end if;
  v_evidence := p_report -> 'evidence';
  if encode(extensions.digest(convert_to(public.season_end_canonical_json(v_evidence), 'UTF8'), 'sha256'), 'hex')
       is distinct from p_report_digest then
    raise exception 'verification report digest does not match its evidence payload';
  end if;
  if jsonb_typeof(v_evidence -> 'reportVersion') is distinct from 'string'
     or v_evidence ->> 'reportVersion' <> 'season-end-verification-v1' then
    raise exception 'verification report version is missing or unsupported';
  end if;
  if jsonb_typeof(v_evidence -> 'revisionDigest') is distinct from 'string'
     or v_evidence ->> 'revisionDigest' is distinct from v_release.revision_digest
     or jsonb_typeof(v_evidence -> 'catalogHash') is distinct from 'string'
     or v_evidence ->> 'catalogHash' is distinct from v_release.catalog_hash then
    raise exception 'verification report inputs do not match the release';
  end if;
  if jsonb_typeof(v_evidence -> 'inputDigest') is distinct from 'string'
     or v_evidence ->> 'inputDigest' !~ '^[0-9a-f]{64}$' then
    raise exception 'verification report input digest is missing';
  end if;
  if encode(extensions.digest(convert_to(public.season_end_canonical_json(jsonb_build_object(
      'catalogHash', v_release.catalog_hash,
      'economy', v_release.economy_payload,
      'revisionDigest', v_release.revision_digest,
      'rules', v_release.rules_payload,
      'signatureCalibration', v_release.signature_calibration,
      'signingBook', v_release.signing_book
    )), 'UTF8'), 'sha256'), 'hex') is distinct from v_evidence ->> 'inputDigest' then
    raise exception 'verification report input digest does not match the frozen release';
  end if;

  v_samples := v_evidence -> 'sampleSizes';
  if jsonb_typeof(v_samples) is distinct from 'object'
     or jsonb_typeof(v_samples -> 'openings') is distinct from 'number'
     or jsonb_typeof(v_samples -> 'collectorTrajectories') is distinct from 'number' then
    raise exception 'verification report sample sizes are incomplete';
  end if;
  v_sample_openings := (v_samples ->> 'openings')::numeric;
  v_min_trajectories := (v_samples ->> 'collectorTrajectories')::numeric;
  if v_sample_openings <> trunc(v_sample_openings) or v_sample_openings < 100000
     or v_min_trajectories <> trunc(v_min_trajectories) or v_min_trajectories < 10000 then
    raise exception 'verification report sample sizes are below the release minimum';
  end if;

  v_scenarios := v_evidence -> 'scenarios';
  if jsonb_typeof(v_scenarios) is distinct from 'object' then
    raise exception 'verification report scenarios are missing';
  end if;
  for v_name, v_expected_patron in
    select name, patron
      from (values ('standard', false), ('maximumPatron', true)) as expected(name, patron)
  loop
    v_scenario := v_scenarios -> v_name;
    if jsonb_typeof(v_scenario) is distinct from 'object' then
      raise exception 'verification report is missing the % scenario', v_name;
    end if;
    if v_scenario ->> 'simulatorVersion' <> 'season-end-simulator-v2'
       or jsonb_typeof(v_scenario -> 'openings') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'packPrice') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'patron') is distinct from 'boolean'
       or (v_scenario ->> 'patron')::boolean is distinct from v_expected_patron then
      raise exception 'verification report % scenario identity is invalid', v_name;
    end if;
    if (v_scenario ->> 'openings')::numeric <> v_sample_openings
       or (v_scenario ->> 'packPrice')::numeric <> v_release.price then
      raise exception 'verification report % scenario does not use the frozen sample or price', v_name;
    end if;
    if jsonb_typeof(v_scenario -> 'supply') is distinct from 'array'
       or jsonb_array_length(v_scenario -> 'supply') < 1
       or jsonb_typeof(v_scenario -> 'completion') is distinct from 'array'
       or jsonb_array_length(v_scenario -> 'completion') < 1
       or jsonb_typeof(v_scenario -> 'signaturesByFamily') is distinct from 'object'
       or jsonb_typeof(v_scenario -> 'finishProbability') is distinct from 'object' then
      raise exception 'verification report % scenario payload is incomplete', v_name;
    end if;
    if jsonb_typeof(v_scenario -> 'signatureProbability') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'signatureProbabilityStandardError') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'expectedDust') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'expectedDustStandardError') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'conservativeSalvageUpperBound') is distinct from 'number'
       or jsonb_typeof(v_scenario -> 'expectedRefundRate') is distinct from 'number' then
      raise exception 'verification report % scenario measurements are incomplete', v_name;
    end if;
    if (v_scenario ->> 'signatureProbability')::numeric < 0 or (v_scenario ->> 'signatureProbability')::numeric > 1
       or (v_scenario ->> 'signatureProbabilityStandardError')::numeric < 0
       or (v_scenario ->> 'expectedDust')::numeric < 0
       or (v_scenario ->> 'expectedDustStandardError')::numeric < 0
       or (v_scenario ->> 'conservativeSalvageUpperBound')::numeric < 0
       or (v_scenario ->> 'conservativeSalvageUpperBound')::numeric < (v_scenario ->> 'expectedDust')::numeric
       or (v_scenario ->> 'expectedRefundRate')::numeric < 0 then
      raise exception 'verification report % scenario contains an invalid confidence bound', v_name;
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_scenario -> 'completion') as completion(value)
       where jsonb_typeof(completion.value) is distinct from 'object'
          or jsonb_typeof(completion.value -> 'trajectories') is distinct from 'number'
          or (completion.value ->> 'trajectories')::numeric < v_min_trajectories
    ) then
      raise exception 'verification report % scenario has insufficient collector trajectories', v_name;
    end if;
  end loop;

  v_patron_scenario := v_scenarios -> 'maximumPatron';
  v_acceptance := v_evidence -> 'acceptance';
  if jsonb_typeof(v_acceptance) is distinct from 'object'
     or jsonb_typeof(v_acceptance -> 'status') is distinct from 'string'
     or v_acceptance ->> 'status' <> 'passed'
     or jsonb_typeof(v_acceptance -> 'signatureGatePassed') is distinct from 'boolean'
     or (v_acceptance ->> 'signatureGatePassed')::boolean is not true
     or jsonb_typeof(v_acceptance -> 'salvageGatePassed') is distinct from 'boolean'
     or (v_acceptance ->> 'salvageGatePassed')::boolean is not true
     or jsonb_typeof(v_acceptance -> 'maximumPatronSalvageUpperBound') is distinct from 'number'
     or jsonb_typeof(v_acceptance -> 'exactRevisionOpeningCount') is distinct from 'number' then
    raise exception 'verification report acceptance evidence is incomplete';
  end if;
  v_value := (v_acceptance ->> 'maximumPatronSalvageUpperBound')::numeric;
  if v_value < 0 or v_value > v_release.price * 0.5
     or v_value is distinct from (v_patron_scenario ->> 'conservativeSalvageUpperBound')::numeric then
    raise exception 'maximum patron salvage evidence is invalid';
  end if;
  v_reported_openings := (v_acceptance ->> 'exactRevisionOpeningCount')::numeric;
  if v_reported_openings <> trunc(v_reported_openings) or v_reported_openings < 1 then
    raise exception 'verification report lacks a positive exact-revision opening count';
  end if;

  if jsonb_typeof(v_release.signature_calibration) is distinct from 'object'
     or jsonb_typeof(v_release.signature_calibration -> 'achievablePackProbability') is distinct from 'number' then
    raise exception 'release signature calibration lacks an achievable measured target';
  end if;
  v_target := (v_release.signature_calibration ->> 'achievablePackProbability')::numeric;
  if v_target < 0 or v_target > 1 then raise exception 'release signature calibration target is invalid'; end if;
  v_tolerance := greatest(0.002::numeric, 4 * (v_scenarios -> 'standard' ->> 'signatureProbabilityStandardError')::numeric);
  if abs((v_scenarios -> 'standard' ->> 'signatureProbability')::numeric - v_target) > v_tolerance then
    raise exception 'standard signature rate is outside the measured tolerance';
  end if;
  v_tolerance := greatest(0.002::numeric, 4 * (v_scenarios -> 'maximumPatron' ->> 'signatureProbabilityStandardError')::numeric);
  if abs((v_scenarios -> 'maximumPatron' ->> 'signatureProbability')::numeric - v_target) > v_tolerance then
    raise exception 'maximum patron signature rate is outside the measured tolerance';
  end if;

  select count(*)::integer into v_actual_openings
    from public.season_end_openings
   where release_id = p_release
     and mode = 'admin_test'
     and status = 'fulfilled'
     and revision_digest = v_release.revision_digest;
  if v_actual_openings < 1 then
    raise exception 'verification report requires at least one fulfilled exact-revision opening';
  end if;
  if v_reported_openings <> v_actual_openings then
    raise exception 'verification report opening count does not match durable evidence';
  end if;
end;
$$;

drop function if exists public.record_season_end_verification_report(uuid, text, text, jsonb, text);
create function public.record_season_end_verification_report(
  p_release uuid,
  p_revision_digest text,
  p_report_digest text,
  p_report jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
  v_existing public.season_end_release_reports%rowtype;
begin
  if p_revision_digest is null then raise exception 'verification report revision is required'; end if;
  perform public.validate_season_end_verification_report(p_release, p_report, p_report_digest);
  if p_report -> 'evidence' ->> 'revisionDigest' is distinct from p_revision_digest then
    raise exception 'verification report revision mismatch';
  end if;
  insert into public.season_end_release_reports (release_id, revision_digest, report_digest, report, recorded_by)
    values (p_release, p_revision_digest, p_report_digest, p_report, p_actor)
    on conflict (release_id, revision_digest, report_digest) do nothing
    returning id into v_id;
  if v_id is not null then return v_id; end if;
  select * into v_existing
    from public.season_end_release_reports
   where release_id = p_release and revision_digest = p_revision_digest and report_digest = p_report_digest;
  if not found or v_existing.report is distinct from p_report then
    raise exception 'verification report digest is already bound to different evidence';
  end if;
  return v_existing.id;
end;
$$;

drop function if exists public.approve_season_end_release(uuid, text, text);
create function public.approve_season_end_release(p_release uuid, p_actor text, p_revision_digest text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_report public.season_end_release_reports%rowtype;
begin
  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found or v_release.state <> 'admin_test' then raise exception 'release is not in admin test'; end if;
  if p_revision_digest is null or p_revision_digest is distinct from v_release.revision_digest then raise exception 'approval revision mismatch'; end if;
  select * into v_report
    from public.season_end_release_reports
   where release_id = p_release
     and revision_digest = v_release.revision_digest
   order by recorded_at desc, id desc
   limit 1;
  if not found then raise exception 'test approval requires a passing verification report'; end if;
  perform public.validate_season_end_verification_report(p_release, v_report.report, v_report.report_digest);
  update public.season_end_releases
     set test_approved_at = now(),
         test_approved_by = p_actor,
         verification_report = jsonb_build_object(
           'reportId', v_report.id,
           'reportDigest', v_report.report_digest,
           'revisionDigest', v_report.revision_digest,
           'recordedBy', v_report.recorded_by,
           'recordedAt', v_report.recorded_at
         ),
         updated_by = p_actor,
         updated_at = now()
   where id = p_release;
  insert into public.season_end_release_events(release_id, actor, event, from_state, to_state, catalog_hash)
    values (p_release, p_actor, 'test_approved', v_release.state, v_release.state, v_release.catalog_hash);
end;
$$;

-- Lock every promise that references a set of copies before any wallet row.
-- The complete set is locked in one consistent order so overlapping offers
-- cannot acquire related trade rows in opposite orders.
create or replace function public.lock_season_end_related_offers(
  p_inventories bigint[],
  p_keep_listing bigint default null,
  p_keep_trade bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1
    from public.season_end_listings
   where inventory_id = any(coalesce(p_inventories, '{}'::bigint[]))
     and status = 'open'
     and (p_keep_listing is null or id <> p_keep_listing)
   order by id
   for update;
  perform 1
    from public.season_end_trades
   where status = 'pending'
     and (p_keep_trade is null or id <> p_keep_trade)
     and (
       offered_inventory_ids && coalesce(p_inventories, '{}'::bigint[])
       or requested_inventory_ids && coalesce(p_inventories, '{}'::bigint[])
     )
   order by id
   for update;
end;
$$;

-- Scalar callers retain their existing signature while using the same
-- complete-set locking boundary.
create or replace function public.lock_season_end_copy_promises(
  p_inventory bigint,
  p_keep_listing bigint default null,
  p_keep_trade bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_season_end_related_offers(array[p_inventory], p_keep_listing, p_keep_trade);
end;
$$;

create or replace function public.cancel_season_end_copy_promises(p_inventory bigint, p_keep_trade bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.lock_season_end_copy_promises(p_inventory, null, p_keep_trade);
  update public.season_end_listings
     set status = 'cancelled', decided_at = now()
   where inventory_id = p_inventory and status = 'open';
  update public.season_end_trades
     set status = 'cancelled', decided_at = now()
   where status = 'pending'
     and (p_keep_trade is null or id <> p_keep_trade)
     and (p_inventory = any(offered_inventory_ids) or p_inventory = any(requested_inventory_ids));
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
  perform public.cancel_season_end_copy_promises(p_inventory);
  select * into v_quote from public.season_end_dust_quote(p_user, p_inventory);
  perform 1 from public.betting_profiles where discord_id = p_user for update;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_quote.value, 'season_end_dust', 'season_end_inventory', p_inventory);
  update public.betting_profiles
     set balance = betting_profiles.balance + v_quote.value
   where discord_id = p_user
   returning betting_profiles.balance into v_balance;
  update public.season_end_inventory
     set lifecycle_status = 'dusted', ownership_version = ownership_version + 1
   where id = p_inventory;
  insert into public.season_end_provenance (inventory_id, event, discord_id)
    values (p_inventory, 'dusted', p_user);
  return query select v_quote.value, v_balance;
end;
$$;

create or replace function public.fill_season_end_want(p_want bigint, p_seller text, p_inventory bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_want public.season_end_wants%rowtype;
  v_copy public.season_end_inventory%rowtype;
  v_first text;
  v_second text;
  v_balance bigint;
begin
  select * into v_copy from public.season_end_inventory where id = p_inventory for update;
  if not found then raise exception 'Season''s End copy is not available'; end if;
  perform public.lock_season_end_copy_promises(p_inventory);
  perform public.cancel_season_end_copy_promises(p_inventory);
  select * into v_want from public.season_end_wants where id = p_want for update;
  if not found or v_want.status <> 'open' then raise exception 'want is not open'; end if;
  if v_want.discord_id = p_seller then raise exception 'cannot fill your own want'; end if;
  if v_copy.release_id <> v_want.release_id or v_copy.design_id <> v_want.design_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> p_seller then raise exception 'Season''s End copy does not match the want'; end if;
  v_first := least(v_want.discord_id, p_seller);
  v_second := greatest(v_want.discord_id, p_seller);
  perform 1 from public.betting_profiles where discord_id = v_first for update;
  perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = v_want.discord_id;
  if v_balance is null or v_balance < v_want.bounty then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (v_want.discord_id, -v_want.bounty, 'season_end_want', 'season_end_wants', p_want),
           (p_seller, v_want.bounty, 'season_end_want', 'season_end_wants', p_want);
  update public.betting_profiles set balance = balance - v_want.bounty where discord_id = v_want.discord_id;
  update public.betting_profiles set balance = balance + v_want.bounty where discord_id = p_seller;
  update public.season_end_inventory
     set discord_id = v_want.discord_id, ownership_version = ownership_version + 1
   where id = p_inventory;
  update public.season_end_wants
     set status = 'filled', filled_inventory_id = p_inventory, filled_by = p_seller, decided_at = now()
   where id = p_want;
  insert into public.season_end_provenance(inventory_id, event, discord_id)
    values (p_inventory, 'sold', v_want.discord_id);
end;
$$;

create or replace function public.buy_season_end_listing(p_listing bigint, p_buyer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing public.season_end_listings%rowtype;
  v_copy public.season_end_inventory%rowtype;
  v_inventory_id bigint;
  v_first text;
  v_second text;
  v_balance bigint;
begin
  select inventory_id into v_inventory_id from public.season_end_listings where id = p_listing;
  if v_inventory_id is null then raise exception 'listing is not open'; end if;
  select * into v_copy from public.season_end_inventory where id = v_inventory_id for update;
  if not found then raise exception 'Season''s End copy is no longer owned'; end if;
  select * into v_listing from public.season_end_listings where id = p_listing for update;
  if not found or v_listing.status <> 'open' or v_listing.expires_at <= now() then raise exception 'listing expired or not open'; end if;
  if v_listing.seller_discord = p_buyer then raise exception 'cannot buy your own listing'; end if;
  if v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_listing.seller_discord or v_copy.release_id <> v_listing.release_id or v_copy.ownership_version <> v_listing.owner_version then raise exception 'Season''s End copy is no longer owned'; end if;
  perform public.lock_season_end_copy_promises(v_copy.id, p_listing, null);
  v_first := least(v_listing.seller_discord, p_buyer);
  v_second := greatest(v_listing.seller_discord, p_buyer);
  perform 1 from public.betting_profiles where discord_id = v_first for update;
  perform 1 from public.betting_profiles where discord_id = v_second for update;
  select balance into v_balance from public.betting_profiles where discord_id = p_buyer;
  if v_balance is null or v_balance < v_listing.ask then raise exception 'insufficient balance'; end if;
  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_buyer, -v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing),
           (v_listing.seller_discord, v_listing.ask, 'season_end_sale', 'season_end_listings', p_listing);
  update public.betting_profiles set balance = balance - v_listing.ask where discord_id = p_buyer;
  update public.betting_profiles set balance = balance + v_listing.ask where discord_id = v_listing.seller_discord;
  update public.season_end_inventory
     set discord_id = p_buyer, ownership_version = ownership_version + 1
   where id = v_copy.id;
  update public.season_end_listings
     set status = 'sold', buyer_discord = p_buyer, decided_at = now()
   where id = p_listing;
  update public.season_end_trades
     set status = 'cancelled', decided_at = now()
   where status = 'pending'
     and (v_copy.id = any(offered_inventory_ids) or v_copy.id = any(requested_inventory_ids));
  insert into public.season_end_provenance(inventory_id, event, discord_id)
    values (v_copy.id, 'sold', p_buyer);
end;
$$;

create or replace function public.accept_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.season_end_trades%rowtype;
  v_copy public.season_end_inventory%rowtype;
  v_id bigint;
  v_net bigint;
  v_payer text;
  v_payee text;
  v_first text;
  v_second text;
  v_balance bigint;
  v_lock_ids bigint[];
  v_index integer;
begin
  select * into v_trade from public.season_end_trades where id = p_trade;
  if not found then raise exception 'Season''s End trade is not pending'; end if;
  select array_agg(id order by id)
    into v_lock_ids
    from unnest(coalesce(v_trade.offered_inventory_ids, '{}') || coalesce(v_trade.requested_inventory_ids, '{}')) as ids(id);
  if v_lock_ids is not null then
    foreach v_id in array v_lock_ids loop
      select * into v_copy from public.season_end_inventory where id = v_id for update;
      if not found then raise exception 'Season''s End trade is stale'; end if;
    end loop;
    perform public.lock_season_end_related_offers(v_lock_ids, null, p_trade);
  end if;
  select * into v_trade from public.season_end_trades where id = p_trade for update;
  if not found or v_trade.status <> 'pending' or v_trade.to_discord <> p_user or v_trade.expires_at <= now() then raise exception 'Season''s End trade is not pending'; end if;
  v_index := 0;
  foreach v_id in array coalesce(v_trade.offered_inventory_ids, '{}') loop
    v_index := v_index + 1;
    select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.from_discord or v_copy.ownership_version <> v_trade.offered_ownership_versions[v_index] then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  v_index := 0;
  foreach v_id in array coalesce(v_trade.requested_inventory_ids, '{}') loop
    v_index := v_index + 1;
    select * into v_copy from public.season_end_inventory where id = v_id;
    if not found or v_copy.release_id <> v_trade.release_id or v_copy.mode <> 'public' or v_copy.lifecycle_status <> 'active' or v_copy.discord_id <> v_trade.to_discord or v_copy.ownership_version <> v_trade.requested_ownership_versions[v_index] then raise exception 'Season''s End trade is stale'; end if;
  end loop;
  if v_lock_ids is not null then
    foreach v_id in array v_lock_ids loop
      perform public.cancel_season_end_copy_promises(v_id, p_trade);
    end loop;
  end if;
  v_net := v_trade.offered_dollars - v_trade.requested_dollars;
  v_first := least(v_trade.from_discord, v_trade.to_discord);
  v_second := greatest(v_trade.from_discord, v_trade.to_discord);
  perform 1 from public.betting_profiles where discord_id = v_first for update;
  perform 1 from public.betting_profiles where discord_id = v_second for update;
  if v_net <> 0 then
    v_payer := case when v_net > 0 then v_trade.from_discord else v_trade.to_discord end;
    v_payee := case when v_net > 0 then v_trade.to_discord else v_trade.from_discord end;
    select balance into v_balance from public.betting_profiles where discord_id = v_payer;
    if v_balance < abs(v_net) then raise exception 'insufficient balance'; end if;
    insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (v_payer, -abs(v_net), 'season_end_trade', 'season_end_trades', p_trade),
             (v_payee, abs(v_net), 'season_end_trade', 'season_end_trades', p_trade);
    update public.betting_profiles set balance = balance - abs(v_net) where discord_id = v_payer;
    update public.betting_profiles set balance = balance + abs(v_net) where discord_id = v_payee;
  end if;
  update public.season_end_inventory set discord_id = v_trade.to_discord, ownership_version = ownership_version + 1 where id = any(v_trade.offered_inventory_ids);
  update public.season_end_inventory set discord_id = v_trade.from_discord, ownership_version = ownership_version + 1 where id = any(v_trade.requested_inventory_ids);
  update public.season_end_trades set status = 'accepted', decided_at = now() where id = p_trade;
  foreach v_id in array (coalesce(v_trade.offered_inventory_ids, '{}') || coalesce(v_trade.requested_inventory_ids, '{}')) loop
    insert into public.season_end_provenance(inventory_id, event, discord_id)
      values (v_id, 'traded', case when v_id = any(v_trade.offered_inventory_ids) then v_trade.to_discord else v_trade.from_discord end);
  end loop;
end;
$$;

create or replace function public.cancel_season_end_listing(p_listing bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory bigint;
  v_listing public.season_end_listings%rowtype;
begin
  select inventory_id into v_inventory from public.season_end_listings where id = p_listing;
  if v_inventory is null then raise exception 'listing is not open'; end if;
  perform 1 from public.season_end_inventory where id = v_inventory for update;
  select * into v_listing from public.season_end_listings where id = p_listing for update;
  if not found or v_listing.seller_discord <> p_user or v_listing.status <> 'open' then raise exception 'listing is not open'; end if;
  update public.season_end_listings set status = 'cancelled', decided_at = now() where id = p_listing;
end;
$$;

create or replace function public.decline_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.season_end_trades%rowtype;
  v_copy public.season_end_inventory%rowtype;
  v_id bigint;
  v_lock_ids bigint[];
begin
  select * into v_trade from public.season_end_trades where id = p_trade;
  if not found then raise exception 'Season''s End trade is not pending'; end if;
  select array_agg(id order by id)
    into v_lock_ids
    from unnest(coalesce(v_trade.offered_inventory_ids, '{}') || coalesce(v_trade.requested_inventory_ids, '{}')) as ids(id);
  if v_lock_ids is not null then
    foreach v_id in array v_lock_ids loop
      select * into v_copy from public.season_end_inventory where id = v_id for update;
      if not found then raise exception 'Season''s End trade is stale'; end if;
    end loop;
    perform public.lock_season_end_related_offers(v_lock_ids, null, p_trade);
  end if;
  select * into v_trade from public.season_end_trades where id = p_trade for update;
  if not found or v_trade.to_discord <> p_user or v_trade.status <> 'pending' then raise exception 'Season''s End trade is not pending'; end if;
  update public.season_end_trades set status = 'declined', decided_at = now() where id = p_trade;
end;
$$;

revoke all on function public.season_end_canonical_json(jsonb) from public, anon, authenticated;
revoke all on function public.validate_season_end_verification_report(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.lock_season_end_related_offers(bigint[], bigint, bigint) from public, anon, authenticated;
revoke all on function public.lock_season_end_copy_promises(bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.record_season_end_verification_report(uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.approve_season_end_release(uuid, text, text) from public, anon, authenticated;
revoke all on function public.dust_season_end_copy(text, bigint) from public, anon, authenticated;
revoke all on function public.fill_season_end_want(bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.buy_season_end_listing(bigint, text) from public, anon, authenticated;
revoke all on function public.accept_season_end_trade(bigint, text) from public, anon, authenticated;
revoke all on function public.cancel_season_end_listing(bigint, text) from public, anon, authenticated;
revoke all on function public.decline_season_end_trade(bigint, text) from public, anon, authenticated;
grant execute on function public.record_season_end_verification_report(uuid, text, text, jsonb, text) to service_role;
grant execute on function public.approve_season_end_release(uuid, text, text) to service_role;
grant execute on function public.dust_season_end_copy(text, bigint) to service_role;
grant execute on function public.fill_season_end_want(bigint, text, bigint) to service_role;
grant execute on function public.buy_season_end_listing(bigint, text) to service_role;
grant execute on function public.accept_season_end_trade(bigint, text) to service_role;
grant execute on function public.cancel_season_end_listing(bigint, text) to service_role;
grant execute on function public.decline_season_end_trade(bigint, text) to service_role;
