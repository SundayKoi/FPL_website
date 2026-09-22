begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
\ir helpers/_season_end_report.sql.inc
select plan(8);

select test_profile(6128) as staff \gset
select test_profile(10) as sender \gset
select test_profile(10) as recipient \gset

select has_function('public', 'cancel_season_end_trade', array['bigint', 'text'], 'senders can cancel their pending trade offers');
select ok(not has_function_privilege('anon', 'public.cancel_season_end_trade(bigint,text)', 'execute'), 'anonymous callers cannot cancel trade offers');
select ok(has_function_privilege('service_role', 'public.cancel_season_end_trade(bigint,text)', 'execute'), 'service role can cancel trade offers');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001928', 'premier', 'S_TEST_0128', 'admin_test', 500, 'hash-0128', 'rules-0128', 'revision-0128', '{"calibratedPerCopyChance":0.01,"achievablePackProbability":0.01}', :'staff');

insert into public.season_end_openings
  (opening_id, request_id, discord_id, release_id, mode, status, price, revision_digest, economy_version, economy_payload, rules_version, rules_payload)
values
  ('00000000-0000-0000-0000-000000002801', '00000000-0000-0000-0000-000000002811', :'staff', '00000000-0000-0000-0000-000000001928', 'admin_test', 'fulfilled', 500, 'revision-0128', 'season-end-economy-2026-09-v1', '{}', 'rules-0128', '{}');

select lives_ok(format($sql$ select public.record_season_end_verification_report(
  '00000000-0000-0000-0000-000000001928'::uuid,
  'revision-0128',
  test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid) ->> 'reportDigest',
  test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid),
  %L
) $sql$, :'staff'), 'a valid report remains recordable');

select throws_ok(format($sql$ select public.record_season_end_verification_report(
  '00000000-0000-0000-0000-000000001928'::uuid,
  'revision-0128',
  test_rewrap_season_end_report(
    test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid),
    jsonb_set(
      jsonb_set(
        jsonb_set(test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid) -> 'evidence', '{scenarios,standard,signatureProbability}', '1'::jsonb),
        '{scenarios,maximumPatron,signatureProbability}', '1'::jsonb
      ),
      '{scenarios,standard,signatureProbabilityStandardError}', '1'::jsonb
    )
  ) ->> 'reportDigest',
  test_rewrap_season_end_report(
    test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid),
    jsonb_set(
      jsonb_set(
        jsonb_set(test_season_end_report('00000000-0000-0000-0000-000000001928'::uuid) -> 'evidence', '{scenarios,standard,signatureProbability}', '1'::jsonb),
        '{scenarios,maximumPatron,signatureProbability}', '1'::jsonb
      ),
      '{scenarios,standard,signatureProbabilityStandardError}', '1'::jsonb
    )
  ),
  %L
) $sql$, :'staff'), 'P0001', null, 'a fabricated high uncertainty cannot approve a 100% signature claim');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, economy_version, economy_payload, rules_payload, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001929', 'premier', 'S_TEST_0128_TRADE', 'draft', 500, 'hash-0128-trade', 'rules-0128-trade', 'season-end-economy-2026-09-v1', '{}', '{}', '{"calibratedPerCopyChance":0.01,"achievablePackProbability":0.01}', :'staff');

insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
values ('00000000-0000-0000-0000-000000001929', 'trade-copy', 'season', '{}', 20);
update public.season_end_releases set state = 'public' where id = '00000000-0000-0000-0000-000000001929'::uuid;

insert into public.season_end_openings
  (opening_id, request_id, discord_id, release_id, mode, status, price, revision_digest, economy_version, economy_payload, rules_version, rules_payload)
values
  ('00000000-0000-0000-0000-000000002821', '00000000-0000-0000-0000-000000002831', :'sender', '00000000-0000-0000-0000-000000001929', 'public', 'fulfilled', 500, 'revision-0128-trade', 'season-end-economy-2026-09-v1', '{}', 'rules-0128-trade', '{}');

insert into public.season_end_inventory
  (release_id, opening_id, discord_id, mode, design_id, kind, payload, slot_position, reveal_order, revision_digest, economy_version, rules_version)
values
  ('00000000-0000-0000-0000-000000001929', '00000000-0000-0000-0000-000000002821', :'sender', 'public', 'trade-copy', 'season', '{}', 1, 1, 'revision-0128-trade', 'season-end-economy-2026-09-v1', 'rules-0128-trade');

select public.create_season_end_trade(:'sender', :'recipient', '00000000-0000-0000-0000-000000001929'::uuid,
  array[(select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002821'::uuid)], '{}', 0, 0) as trade_id \gset trade_
select lives_ok(format($sql$ select public.cancel_season_end_trade(%s, %L) $sql$, :'trade_trade_id', :'sender'), 'the sender can withdraw a pending trade');
select is((select status from public.season_end_trades where id = :'trade_trade_id'::bigint), 'cancelled', 'sender withdrawal marks the trade cancelled');
select throws_ok(format($sql$ select public.cancel_season_end_trade(%s, %L) $sql$, :'trade_trade_id', :'recipient'), 'P0001', null, 'the recipient cannot withdraw the sender''s trade');

select * from finish();
rollback;
