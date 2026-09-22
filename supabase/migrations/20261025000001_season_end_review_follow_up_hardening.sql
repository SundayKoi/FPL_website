-- Follow-up hardening for the Season's End review findings.
-- Keep this forward-only: the prior release migration may already be applied.

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

  -- Do not trust the report's standard-error fields for the acceptance gate.
  -- The report's measured rate and frozen opening count define the Bernoulli
  -- standard error; a locally fabricated uncertainty must not widen the gate.
  v_tolerance := greatest(
    0.002::numeric,
    4 * sqrt(greatest(
      0::numeric,
      (v_scenarios -> 'standard' ->> 'signatureProbability')::numeric
        * (1 - (v_scenarios -> 'standard' ->> 'signatureProbability')::numeric)
    ) / v_sample_openings)
  );
  if abs((v_scenarios -> 'standard' ->> 'signatureProbability')::numeric - v_target) > v_tolerance then
    raise exception 'standard signature rate is outside the measured tolerance';
  end if;
  v_tolerance := greatest(
    0.002::numeric,
    4 * sqrt(greatest(
      0::numeric,
      (v_scenarios -> 'maximumPatron' ->> 'signatureProbability')::numeric
        * (1 - (v_scenarios -> 'maximumPatron' ->> 'signatureProbability')::numeric)
    ) / v_sample_openings)
  );
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

create or replace function public.cancel_season_end_trade(p_trade bigint, p_user text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade public.season_end_trades%rowtype;
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
      perform 1 from public.season_end_inventory where id = v_id for update;
      if not found then raise exception 'Season''s End trade is stale'; end if;
    end loop;
    perform public.lock_season_end_related_offers(v_lock_ids, null, p_trade);
  end if;
  select * into v_trade from public.season_end_trades where id = p_trade for update;
  if not found or v_trade.from_discord <> p_user or v_trade.status <> 'pending' then
    raise exception 'Season''s End trade is not pending';
  end if;
  update public.season_end_trades set status = 'cancelled', decided_at = now() where id = p_trade;
end;
$$;

revoke all on function public.cancel_season_end_trade(bigint, text) from public, anon, authenticated;
grant execute on function public.cancel_season_end_trade(bigint, text) to service_role;
