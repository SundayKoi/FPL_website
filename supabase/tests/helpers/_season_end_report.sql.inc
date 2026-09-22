-- Deterministic complete evidence envelope for Season's End approval fixtures.
-- The production simulator emits the same shape; this keeps pgTAP focused on
-- the database contract rather than on hand-maintaining a digest literal.
create or replace function test_season_end_report(p_release uuid)
returns jsonb
language plpgsql
as $$
declare
  v_release public.season_end_releases%rowtype;
  v_openings integer;
  v_target numeric;
  v_input_digest text;
  v_standard jsonb;
  v_patron jsonb;
  v_evidence jsonb;
begin
  select * into v_release from public.season_end_releases where id = p_release;
  select count(*)::integer into v_openings
    from public.season_end_openings
   where release_id = p_release and mode = 'admin_test' and status = 'fulfilled' and revision_digest = v_release.revision_digest;
  v_target := coalesce((v_release.signature_calibration ->> 'achievablePackProbability')::numeric, 0.01);
  v_input_digest := encode(extensions.digest(convert_to(public.season_end_canonical_json(jsonb_build_object(
    'catalogHash', v_release.catalog_hash,
    'economy', v_release.economy_payload,
    'revisionDigest', v_release.revision_digest,
    'rules', v_release.rules_payload,
    'signatureCalibration', v_release.signature_calibration,
    'signingBook', v_release.signing_book
  )), 'UTF8'), 'sha256'), 'hex');
  v_standard := jsonb_build_object(
    'simulatorVersion', 'season-end-simulator-v2',
    'openings', 100000,
    'packPrice', v_release.price,
    'supply', jsonb_build_array(jsonb_build_object('openings', 100, 'family', jsonb_build_object('season', 200, 'accolade', 200, 'best_of', 100), 'perDesign', jsonb_build_object())),
    'completion', jsonb_build_array(jsonb_build_object('packs', 5, 'trajectories', 10000, 'meanCompleted', 1, 'p10Completed', 1, 'medianCompleted', 1, 'p90Completed', 1, 'meanDuplicateCards', 1)),
    'signatureProbability', v_target,
    -- This is deliberately written in the same decimal form emitted by the
    -- JavaScript simulator after canonical number normalization.
    'signatureProbabilityStandardError', 0.00000009999999999,
    'signedCopiesPerPack', 0.01,
    'signaturesByFamily', jsonb_build_object('season', 1, 'accolade', 0, 'best_of', 0),
    'finishProbability', jsonb_build_object('prisma', 0.25, 'aurora', 0.25, 'refractor', 0.25, 'ice', 0.25),
    'guaranteedFoilProbability', 0.2,
    'guaranteedSlotFoilRate', 1,
    'expectedDust', 100,
    'expectedDustStandardError', 1,
    'conservativeSalvageUpperBound', 100,
    'expectedRefundRate', 0.2,
    'patron', false,
    'seed', 1,
    'economyVersion', v_release.economy_version
  );
  v_patron := jsonb_set(v_standard, '{patron}', 'true'::jsonb);
  v_patron := jsonb_set(v_patron, '{expectedDust}', '120'::jsonb);
  v_patron := jsonb_set(v_patron, '{conservativeSalvageUpperBound}', '120'::jsonb);
  v_patron := jsonb_set(v_patron, '{expectedRefundRate}', '0.24'::jsonb);
  v_evidence := jsonb_build_object(
    'reportVersion', 'season-end-verification-v1',
    'revisionDigest', v_release.revision_digest,
    'catalogHash', v_release.catalog_hash,
    'inputDigest', v_input_digest,
    'sampleSizes', jsonb_build_object('openings', 100000, 'collectorTrajectories', 10000),
    'scenarios', jsonb_build_object('standard', v_standard, 'maximumPatron', v_patron),
    'acceptance', jsonb_build_object('status', 'passed', 'signatureGatePassed', true, 'salvageGatePassed', true, 'maximumPatronSalvageUpperBound', 120, 'exactRevisionOpeningCount', v_openings)
  );
  return jsonb_build_object(
    'reportDigest', encode(extensions.digest(convert_to(public.season_end_canonical_json(v_evidence), 'UTF8'), 'sha256'), 'hex'),
    'evidence', v_evidence
  );
end;
$$;

create or replace function test_rewrap_season_end_report(p_report jsonb, p_evidence jsonb)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'reportDigest', encode(extensions.digest(convert_to(public.season_end_canonical_json(p_evidence), 'UTF8'), 'sha256'), 'hex'),
    'evidence', p_evidence
  );
$$;
