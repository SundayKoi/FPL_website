begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
\ir helpers/_season_end_report.sql.inc
select plan(32);

select test_profile(6000) as collector \gset
select test_profile(4000) as seller \gset
select test_profile(4000) as buyer \gset

select has_column('public', 'season_end_releases', 'revision_digest', 'releases store a full immutable revision digest');
select has_column('public', 'season_end_inventory', 'lifecycle_status', 'Season''s End copies have an explicit lifecycle');
select ok(not has_table_privilege('anon', 'public.season_end_listings', 'select'), 'commerce tables have no direct anonymous read grant');
select ok(not has_function_privilege('anon', 'public.dust_season_end_copy(text,bigint)', 'execute'), 'dust remains service-role only');
select ok(has_function_privilege('service_role', 'public.create_season_end_listing(text,bigint,bigint,text)', 'execute'), 'service role can create a Season''s End listing');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001925', 'premier', 'S_TEST_0125', 'draft', 500, 'hash-0125', 'rules-0125', 'revision-0125', '{"calibratedPerCopyChance":0.01,"achievablePackProbability":0.01}', :'collector');

insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
values
  ('00000000-0000-0000-0000-000000001925', 's1', 'season',   '{"designId":"s1","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":true,"player":{"key":"player-1"}}', 20),
  ('00000000-0000-0000-0000-000000001925', 's2', 'season',   '{"designId":"s2","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":true,"player":{"key":"player-2"}}', 20),
  ('00000000-0000-0000-0000-000000001925', 'a1', 'accolade', '{"designId":"a1","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":false}', 30),
  ('00000000-0000-0000-0000-000000001925', 'a2', 'accolade', '{"designId":"a2","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":false}', 30),
  ('00000000-0000-0000-0000-000000001925', 'b1', 'best_of',  '{"designId":"b1","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":true,"player":{"key":"player-3"}}', 30),
  ('00000000-0000-0000-0000-000000001925', 'b2', 'best_of',  '{"designId":"b2","releaseId":"00000000-0000-0000-0000-000000001925","league":"premier","season":"S_TEST_0125","signatureEligible":true,"player":{"key":"player-4"}}', 30);

update public.season_end_releases set state = 'admin_test' where id = '00000000-0000-0000-0000-000000001925';

select * from public.begin_season_end_opening('00000000-0000-0000-0000-000000002501'::uuid, :'collector', '00000000-0000-0000-0000-000000001925'::uuid, 'admin_test') \gset admin_
select is(:'admin_status'::text, 'pending', 'admin test opening starts pending');
select is(:'admin_test_balance'::bigint, 5500::bigint, 'admin test debit uses the isolated wallet');
select * from public.begin_season_end_opening('00000000-0000-0000-0000-000000002501'::uuid, :'collector', '00000000-0000-0000-0000-000000001925'::uuid, 'admin_test') \gset recovery_
select is(:'recovery_opening_id'::uuid, :'admin_opening_id'::uuid, 'the exact request recovers the original opening');

select jsonb_build_array(
  jsonb_build_object('design_id','s1','kind','season','foil',false,'signed',false,'guaranteed_foil',false),
  jsonb_build_object('design_id','s2','kind','season','foil',false,'signed',false,'guaranteed_foil',false),
  jsonb_build_object('design_id','a1','kind','accolade','foil',false,'signed',false,'guaranteed_foil',false),
  jsonb_build_object('design_id','b1','kind','best_of','foil',false,'signed',false,'guaranteed_foil',false),
  jsonb_build_object('design_id','a2','kind','accolade','foil',true,'foil_type','prisma','signed',false,'guaranteed_foil',true)
) as outcome \gset
select * from public.prepare_season_end_opening(:'admin_opening_id'::uuid, :'outcome'::jsonb) \gset prepared_
select is(:'prepared_prepared'::boolean, true, 'the first valid candidate is prepared');
select * from public.prepare_season_end_opening(:'admin_opening_id'::uuid, jsonb_set(:'outcome'::jsonb, '{0,design_id}', '"s2"'::jsonb)) \gset conflict_
select is(:'conflict_prepared'::boolean, false, 'a competing retry cannot replace the committed outcome');
select is(:'conflict_outcome'::jsonb, :'prepared_outcome'::jsonb, 'competing retries receive the committed outcome');
select * from public.fulfill_season_end_opening(:'admin_opening_id'::uuid, :'outcome'::jsonb) \gset admin_fulfilled_
select is(:'admin_fulfilled_minted'::boolean, true, 'fulfillment mints the prepared outcome');
select is((select count(*)::int from public.season_end_inventory where opening_id = :'admin_opening_id'::uuid and slot_position between 1 and 5), 5, 'fulfillment persists slot order');
select is((select revision_digest from public.season_end_inventory where opening_id = :'admin_opening_id'::uuid limit 1), 'revision-0125', 'copies pin the release digest');

select lives_ok($$ select public.record_season_end_verification_report(
  '00000000-0000-0000-0000-000000001925'::uuid,
  'revision-0125',
  test_season_end_report('00000000-0000-0000-0000-000000001925'::uuid) ->> 'reportDigest',
  test_season_end_report('00000000-0000-0000-0000-000000001925'::uuid),
  'release-staff'
) $$, 'a passing exact-revision verification report can be recorded');
select is((select count(*)::int from public.season_end_release_reports where release_id = '00000000-0000-0000-0000-000000001925'::uuid), 1, 'verification evidence is durable');
select lives_ok($$ select public.approve_season_end_release('00000000-0000-0000-0000-000000001925'::uuid, 'release-staff', 'revision-0125') $$, 'approval requires and records a successful admin opening');
select lives_ok($$ select public.transition_season_end_release('00000000-0000-0000-0000-000000001925'::uuid, 'public', 'release-staff', 'hash-0125', 'revision-0125') $$, 'only the approved exact revision can publish');

select * from public.begin_season_end_opening('00000000-0000-0000-0000-000000002502'::uuid, :'seller', '00000000-0000-0000-0000-000000001925'::uuid, 'public') \gset public_
select is(:'public_price'::bigint, 500::bigint, 'public openings use the frozen release price');
select lives_ok(format($$ select public.prepare_season_end_opening(%L, %L::jsonb) $$, :'public_opening_id', :'outcome'), 'public openings accept the frozen outcome');
select lives_ok(format($$ select public.fulfill_season_end_opening(%L, %L::jsonb) $$, :'public_opening_id', :'outcome'), 'public openings mint before commerce');
select id as inventory_id from public.season_end_inventory where opening_id = :'public_opening_id'::uuid and slot_position = 1 \gset copy_
select public.create_season_end_listing(:'seller', :'copy_inventory_id'::bigint, 700, 'frozen copy') as listing_id \gset listing_
select is((select status from public.season_end_listings where id = :'listing_listing_id'::bigint), 'open', 'a public copy can be listed');
select lives_ok(format($$ select public.buy_season_end_listing(%s, %L) $$, :'listing_listing_id', :'buyer'), 'buying a listing settles the wallet and copy atomically');
select is((select discord_id from public.season_end_inventory where id = :'copy_inventory_id'::bigint), :'buyer', 'the listing transfers the exact copy');
select public.create_season_end_want(:'seller', '00000000-0000-0000-0000-000000001925'::uuid, 's1', 50, null) as want_id \gset want_
select lives_ok(format($$ select public.fill_season_end_want(%s, %L, %s) $$, :'want_want_id', :'buyer', :'copy_inventory_id'), 'the wanted board settles through the same copy boundary');
select is((select discord_id from public.season_end_inventory where id = :'copy_inventory_id'::bigint), :'seller', 'filling a want transfers ownership to the poster');
select public.create_season_end_trade(:'seller', :'buyer', '00000000-0000-0000-0000-000000001925'::uuid, array[:'copy_inventory_id'::bigint], '{}', 10, 0) as trade_id \gset trade_
select lives_ok(format($$ select public.accept_season_end_trade(%s, %L) $$, :'trade_trade_id', :'buyer'), 'accepting a trade settles both sides atomically');
select is((select discord_id from public.season_end_inventory where id = :'copy_inventory_id'::bigint), :'buyer', 'the accepted trade transfers the offered copy');
select * from public.season_end_dust_quote(:'buyer', :'copy_inventory_id'::bigint) \gset quote_
select ok(:'quote_value'::bigint > 0, 'dust quote is positive for an active copy');
select lives_ok(format($$ select public.dust_season_end_copy(%L, %s) $$, :'buyer', :'copy_inventory_id'), 'dust is an atomic terminal transition');
select is((select lifecycle_status from public.season_end_inventory where id = :'copy_inventory_id'::bigint), 'dusted', 'dust marks the copy instead of deleting its history');
select ok((select count(*) from public.season_end_provenance where inventory_id = :'copy_inventory_id'::bigint and event = 'dusted') = 1, 'dust appends provenance');

select * from finish();
rollback;
