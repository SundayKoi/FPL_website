begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
\ir helpers/_season_end_report.sql.inc
select plan(22);

select test_profile(6000) as collector \gset
select test_profile(500) as buyer \gset

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001923', 'premier', 'S_TEST_0123', 'draft', 500, 'hash-0123', 'test-rules', '{"calibratedPerCopyChance":0.01,"achievablePackProbability":0.01}', :'collector');

update public.season_end_releases
   set revision_digest = 'revision-0123'
 where id = '00000000-0000-0000-0000-000000001923';

insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
values
  ('00000000-0000-0000-0000-000000001923', 's1', 'season',  '{"designId":"s1"}', 20),
  ('00000000-0000-0000-0000-000000001923', 's2', 'season',  '{"designId":"s2"}', 20),
  ('00000000-0000-0000-0000-000000001923', 'a1', 'accolade', '{"designId":"a1"}', 30),
  ('00000000-0000-0000-0000-000000001923', 'a2', 'accolade', '{"designId":"a2"}', 30),
  ('00000000-0000-0000-0000-000000001923', 'b1', 'best_of',  '{"designId":"b1"}', 30),
  ('00000000-0000-0000-0000-000000001923', 'b2', 'best_of',  '{"designId":"b2"}', 30);

select ok(not has_table_privilege('anon', 'public.season_end_inventory', 'select'), 'test inventory has no direct anon read grant');
select ok(not has_function_privilege('anon', 'public.begin_season_end_opening(uuid,text,uuid,text)', 'execute'), 'opening RPC is service-role only');
select ok(has_function_privilege('service_role', 'public.begin_season_end_opening(uuid,text,uuid,text)', 'execute'), 'service role can begin an opening');

update public.season_end_releases set state = 'admin_test' where id = '00000000-0000-0000-0000-000000001923';

select * from public.begin_season_end_opening(
  '00000000-0000-0000-0000-000000001001'::uuid, :'collector',
  '00000000-0000-0000-0000-000000001923'::uuid, 'admin_test'
) \gset first_
select is(:'first_status'::text, 'pending'::text, 'a new admin-test opening starts pending');
select is(:'first_test_balance'::bigint, 5500::bigint, 'admin-test opening debits only the virtual wallet');

select * from public.begin_season_end_opening(
  '00000000-0000-0000-0000-000000001001'::uuid, :'collector',
  '00000000-0000-0000-0000-000000001923'::uuid, 'admin_test'
) \gset retry_
select is(:'retry_opening_id'::uuid, :'first_opening_id'::uuid, 'same request returns the original opening');
select is((select balance from public.season_end_test_wallets where release_id = '00000000-0000-0000-0000-000000001923' and discord_id = :'collector'), 5500::bigint, 'same request does not debit the virtual wallet twice');

select jsonb_build_array(
  jsonb_build_object('design_id','s1','kind','season','foil',false,'foil_type',null,'signed',false,'autograph',null,'guaranteed_foil',false,'payload','{"designId":"s1"}'::jsonb),
  jsonb_build_object('design_id','s2','kind','season','foil',false,'foil_type',null,'signed',false,'autograph',null,'guaranteed_foil',false,'payload','{"designId":"s2"}'::jsonb),
  jsonb_build_object('design_id','a1','kind','accolade','foil',false,'foil_type',null,'signed',false,'autograph',null,'guaranteed_foil',false,'payload','{"designId":"a1"}'::jsonb),
  jsonb_build_object('design_id','b1','kind','best_of','foil',false,'foil_type',null,'signed',false,'autograph',null,'guaranteed_foil',false,'payload','{"designId":"b1"}'::jsonb),
  jsonb_build_object('design_id','a2','kind','accolade','foil',true,'foil_type','prisma','signed',false,'autograph',null,'guaranteed_foil',true,'payload','{"designId":"a2"}'::jsonb)
) as outcome \gset

select * from public.prepare_season_end_opening(:'first_opening_id'::uuid, :'outcome'::jsonb);
select * from public.fulfill_season_end_opening(:'first_opening_id'::uuid, :'outcome'::jsonb) \gset fulfilled_
select is(:'fulfilled_minted'::boolean, true, 'fulfillment is committed once');
select is((select count(*)::int from public.season_end_inventory where opening_id = :'first_opening_id'::uuid), 5, 'exactly five isolated inventory rows are created');
select is((select count(*)::int from public.season_end_provenance where opening_id = :'first_opening_id'::uuid and event = 'minted'), 5, 'every test copy receives mint provenance');

select * from public.begin_season_end_opening(
  '00000000-0000-0000-0000-000000001002'::uuid, :'collector',
  '00000000-0000-0000-0000-000000001923'::uuid, 'admin_test'
) \gset second_
select throws_ok(format($sql$
  select * from public.prepare_season_end_opening(
    %L::uuid,
    jsonb_set(%L::jsonb, '{2,signed}', 'true'::jsonb)
  )
$sql$, :'second_opening_id', :'outcome'), 'P0001', 'Season''s End accolades cannot be signed', 'the database rejects a signed accolade');
select lives_ok(format($sql$ select public.refund_season_end_opening(%L::uuid) $sql$, :'second_opening_id'), 'a pending test opening can be refunded');
select lives_ok(format($sql$ select public.refund_season_end_opening(%L::uuid) $sql$, :'second_opening_id'), 'repeating a refund is idempotent');
select is((select balance from public.season_end_test_wallets where release_id = '00000000-0000-0000-0000-000000001923' and discord_id = :'collector'), 5500::bigint, 'refund restores the virtual wallet exactly once');

select lives_ok($$ select public.record_season_end_verification_report(
  '00000000-0000-0000-0000-000000001923'::uuid,
  'revision-0123',
  test_season_end_report('00000000-0000-0000-0000-000000001923'::uuid) ->> 'reportDigest',
  test_season_end_report('00000000-0000-0000-0000-000000001923'::uuid),
  'release-staff'
) $$, 'the pack fixture records complete approval evidence');
select lives_ok($$ select public.approve_season_end_release('00000000-0000-0000-0000-000000001923'::uuid, 'release-staff', 'revision-0123') $$, 'staff can record a test approval');
select lives_ok($$ select public.transition_season_end_release('00000000-0000-0000-0000-000000001923'::uuid, 'public', 'release-staff', 'hash-0123', 'revision-0123') $$, 'publication is an explicit state transition');
select is((select state from public.season_end_releases where id = '00000000-0000-0000-0000-000000001923'), 'public', 'release is public only after approval');

select * from public.begin_season_end_opening(
  '00000000-0000-0000-0000-000000001003'::uuid, :'buyer',
  '00000000-0000-0000-0000-000000001923'::uuid, 'public'
) \gset public_
select is(:'public_price'::bigint, 500::bigint, 'public opening uses the authoritative release price');
select is((select balance from public.betting_profiles where discord_id = :'buyer'), 0::bigint, 'public opening debits the real wallet once');

select is(public.season_end_dust_value('season', 'prisma', false, false), 40::bigint, 'SQL salvage quote matches the Season Card base contract');
select is(public.season_end_dust_value('accolade', 'ice', true, true), 1674::bigint, 'SQL salvage quote includes parallel, signature and patron multipliers');

select * from finish();
rollback;
