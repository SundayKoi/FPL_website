begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(17);

select test_profile(6001) as seller \gset
select test_profile(6002) as buyer \gset

select has_column('public', 'season_end_openings', 'rules_payload', 'openings pin the exact rules payload');
select has_column('public', 'season_end_inventory', 'ownership_version', 'copies carry an ownership version');
select has_column('public', 'season_end_listings', 'owner_version', 'listings pin the owner version');
select has_column('public', 'season_end_trades', 'offered_ownership_versions', 'trades pin offered ownership versions');
select has_column('public', 'season_end_trades', 'requested_ownership_versions', 'trades pin requested ownership versions');
select has_column('public', 'season_end_trades', 'expires_at', 'trades expire durably');
select has_table('public', 'season_end_release_reports', 'verification reports are durable rows');
select ok(not has_function_privilege('anon', 'public.record_season_end_verification_report(uuid,text,text,jsonb,text)', 'execute'), 'anonymous clients cannot record verification evidence');
select ok(has_function_privilege('service_role', 'public.record_season_end_verification_report(uuid,text,text,jsonb,text)', 'execute'), 'service role can record verification evidence');
select ok(has_function_privilege('service_role', 'public.approve_season_end_release(uuid,text,text)', 'execute'), 'approval exposes the exact-revision signature');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, economy_version, economy_payload, rules_payload, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001926', 'premier', 'S_TEST_0126', 'draft', 500, 'hash-0126', 'rules-0126', 'revision-0126', 'season-end-economy-2026-09-v1', '{"version":"season-end-economy-2026-09-v1","patronMultiplier":1.2,"signatureBonus":1200,"foilDustMultipliers":{"prisma":2,"aurora":3,"refractor":4.5,"ice":6.5},"baseSalvageByKind":{"season":20,"best_of":30,"accolade":30}}', '{"foilChance":0.04}', '{"calibratedPerCopyChance":0.01}', :'seller');

insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
values ('00000000-0000-0000-0000-000000001926', 'd1', 'season', '{}', 20);
update public.season_end_releases set state = 'public' where id = '00000000-0000-0000-0000-000000001926'::uuid;

insert into public.season_end_openings
  (opening_id, request_id, discord_id, release_id, mode, status, price, outcome, revision_digest, economy_version, economy_payload, rules_version, rules_payload)
values
  ('00000000-0000-0000-0000-000000002601', '00000000-0000-0000-0000-000000002611', :'seller', '00000000-0000-0000-0000-000000001926', 'public', 'fulfilled', 500, '[]', 'revision-0126', 'season-end-economy-2026-09-v1', '{}', 'rules-0126', '{"foilChance":0.04}'),
  ('00000000-0000-0000-0000-000000002602', '00000000-0000-0000-0000-000000002612', :'seller', '00000000-0000-0000-0000-000000001926', 'public', 'fulfilled', 500, '[]', 'revision-0126', 'season-end-economy-2026-09-v1', '{}', 'rules-0126', '{"foilChance":0.04}'),
  ('00000000-0000-0000-0000-000000002603', '00000000-0000-0000-0000-000000001926', :'buyer',  '00000000-0000-0000-0000-000000001926', 'public', 'fulfilled', 500, '[]', 'revision-0126', 'season-end-economy-2026-09-v1', '{}', 'rules-0126', '{"foilChance":0.04}');

insert into public.season_end_inventory
  (release_id, opening_id, discord_id, mode, design_id, kind, payload, slot_position, reveal_order, revision_digest, economy_version, rules_version)
values
  ('00000000-0000-0000-0000-000000001926', '00000000-0000-0000-0000-000000002601', :'seller', 'public', 'd1', 'season', '{}', 1, 1, 'revision-0126', 'season-end-economy-2026-09-v1', 'rules-0126'),
  ('00000000-0000-0000-0000-000000001926', '00000000-0000-0000-0000-000000002602', :'seller', 'public', 'd1', 'season', '{}', 1, 1, 'revision-0126', 'season-end-economy-2026-09-v1', 'rules-0126'),
  ('00000000-0000-0000-0000-000000001926', '00000000-0000-0000-0000-000000002603', :'buyer',  'public', 'd1', 'season', '{}', 1, 1, 'revision-0126', 'season-end-economy-2026-09-v1', 'rules-0126');

select public.create_season_end_listing(:'seller', (select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002601'::uuid), 700, null) as listing_id \gset listing_
update public.season_end_inventory set ownership_version = ownership_version + 1 where opening_id = '00000000-0000-0000-0000-000000002601'::uuid;
select throws_ok(format($$ select public.buy_season_end_listing(%s, %L) $$, :'listing_listing_id', :'buyer'), 'P0001', null, 'a stale listing cannot transfer after an ownership version change');
update public.season_end_listings set status = 'cancelled', decided_at = now() where id = :'listing_listing_id'::bigint;
select public.create_season_end_listing(:'seller', (select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002601'::uuid), 700, null) as listing_id \gset expired_
update public.season_end_listings set expires_at = now() - interval '1 minute' where id = :'expired_listing_id'::bigint;
select public.create_season_end_listing(:'seller', (select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002601'::uuid), 701, null) as listing_id \gset relisted_
select is((select status from public.season_end_listings where id = :'expired_listing_id'::bigint), 'expired', 'expired listings are closed before a relist');
select is((select status from public.season_end_listings where id = :'relisted_listing_id'::bigint), 'open', 'a copy can be relisted after expiry');

select public.create_season_end_trade(:'seller', :'buyer', '00000000-0000-0000-0000-000000001926'::uuid,
  array[(select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002602'::uuid)],
  array[(select id from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000002603'::uuid)], 0, 0) as trade_id \gset trade_
select is((select cardinality(offered_ownership_versions) from public.season_end_trades where id = :'trade_trade_id'::bigint), 1, 'trade stores an ownership version for each offered copy');
update public.season_end_inventory set ownership_version = ownership_version + 1 where opening_id = '00000000-0000-0000-0000-000000002602'::uuid;
select throws_ok(format($$ select public.accept_season_end_trade(%s, %L) $$, :'trade_trade_id', :'buyer'), 'P0001', null, 'a stale trade cannot transfer after an ownership version change');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, economy_payload, rules_payload, signature_calibration, created_by)
values ('00000000-0000-0000-0000-000000001927', 'premier', 'S_TEST_0126B', 'draft', 500, 'hash-0126b', 'rules-0126b', 'revision-0126b', '{"version":"season-end-economy-2026-09-v1"}', '{"foilChance":0.04}', '{"calibratedPerCopyChance":0.01}', :'seller');
insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
select '00000000-0000-0000-0000-000000001927'::uuid, id, kind, '{}', 20
from (values ('s1','season'),('s2','season'),('a1','accolade'),('a2','accolade'),('b1','best_of'),('b2','best_of')) designs(id, kind);
update public.season_end_releases set state = 'admin_test' where id = '00000000-0000-0000-0000-000000001927'::uuid;
select throws_ok($$ select public.record_season_end_verification_report(
  '00000000-0000-0000-0000-000000001927'::uuid, 'wrong-revision',
  '0126012601260126012601260126012601260126012601260126012601260126',
  '{"reportVersion":"test-v1"}'::jsonb, 'staff') $$, 'P0001', null, 'reports cannot be recorded for another revision');
select throws_ok($$ select public.approve_season_end_release('00000000-0000-0000-0000-000000001927'::uuid, 'staff', 'revision-0126b') $$, 'P0001', null, 'approval cannot fabricate evidence when no report exists');

select * from finish();
rollback;
