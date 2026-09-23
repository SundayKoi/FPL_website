-- Rebuild the current mutable Premier S5 Season's End draft after the
-- application serializer was made consistent with JSON serialization.
--
-- This is deliberately data-driven: the release UUID differs by environment,
-- and only a draft may be replaced. The existing admin-test/public revision is
-- never selected or modified.
do $$
declare
  v_release public.season_end_releases%rowtype;
  v_designs jsonb;
  v_catalog_designs jsonb;
  v_catalog jsonb;
  v_catalog_hash text;
  v_revision jsonb;
  v_revision_digest text;
begin
  select * into v_release
    from public.season_end_releases
   where league = 'premier'
     and season = 'S5'
     and state = 'draft'
   order by catalog_version desc, created_at desc, id desc
   limit 1
   for update;

  if not found then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'design_id', design_id,
      'kind', kind,
      'payload', payload,
      'base_salvage', base_salvage
    ) order by design_id), '[]'::jsonb)
    into v_designs
    from public.season_end_designs
   where release_id = v_release.id;

  select coalesce(jsonb_agg(payload || jsonb_build_object('designId', design_id) order by design_id), '[]'::jsonb)
    into v_catalog_designs
    from public.season_end_designs
   where release_id = v_release.id;

  v_catalog := jsonb_build_object(
    'releaseId', v_release.id,
    'league', v_release.league,
    'season', v_release.season,
    'schemaVersion', 1,
    'rulesVersion', v_release.rules_version,
    'withheldAwards', v_release.withheld_awards,
    'designs', v_catalog_designs
  );
  v_catalog_hash := encode(extensions.digest(
    convert_to(public.season_end_canonical_json(v_catalog_designs), 'UTF8'),
    'sha256'
  ), 'hex');
  v_revision := jsonb_build_object(
    'schema', 'season-end-release-v1',
    'catalog', v_catalog,
    'price', v_release.price,
    'rules', v_release.rules_payload,
    'signingBook', v_release.signing_book,
    'economy', v_release.economy_payload,
    'calibration', v_release.signature_calibration,
    'reviewDecisions', '{}'::jsonb
  );
  v_revision_digest := encode(extensions.digest(
    convert_to(public.season_end_canonical_json(v_revision), 'UTF8'),
    'sha256'
  ), 'hex');

  if v_release.catalog_hash = v_catalog_hash and v_release.revision_digest = v_revision_digest then
    return;
  end if;

  perform public.replace_season_end_draft_catalog(
    v_release.id,
    coalesce(v_release.catalog_hash, ''),
    v_catalog_hash,
    v_revision_digest,
    v_release.rules_version,
    v_release.rules_payload,
    v_release.economy_version,
    v_release.economy_payload,
    v_release.signing_book,
    v_release.withheld_awards,
    v_release.source_completeness,
    v_release.signature_calibration,
    v_designs,
    coalesce(v_release.updated_by, v_release.created_by, 'season-end-hash-repair')
  );
end;
$$;
