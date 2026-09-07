-- God Pack openings are server-owned, exactly five cards, retry-safe, and
-- independently identified from the paid pack ledger.
begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(26);

select has_table('public', 'card_pack_openings', 'the durable opening table exists');
select has_column('public', 'card_pack_openings', 'opening_id', 'the server owns an opening id');
select has_column('public', 'card_inventory', 'opening_id', 'copies carry their opening provenance');
select has_column('public', 'card_provenance', 'opening_id', 'history carries the opening provenance');
select has_function('public', 'begin_card_pack_opening', array['uuid', 'text', 'text', 'text', 'bigint']);
select has_function('public', 'fulfill_card_pack_opening', array['uuid', 'text', 'jsonb']);
select has_function('public', 'refund_card_pack_opening', array['uuid']);
select has_function('public', 'set_card_pack_variant', array['uuid', 'text']);
select is(has_function_privilege('anon', 'public.begin_card_pack_opening(uuid,text,text,text,bigint)', 'execute'), false, 'anon cannot begin an opening');
select is(has_function_privilege('authenticated', 'public.fulfill_card_pack_opening(uuid,text,jsonb)', 'execute'), false, 'users cannot fulfill an opening directly');
select is(has_function_privilege('authenticated', 'public.set_card_pack_variant(uuid,text)', 'execute'), false, 'users cannot choose an opening variant');

create temp table folks as select test_profile(9200) as alice;
insert into public.card_pack_comps(discord_id, kind, remaining, granted, reason)
values ((select alice from folks), 'standard', 1, 1, 'god pack test');

create temp table begun as
  select * from public.begin_card_pack_opening(
    '92020000-0000-4000-8000-000000000001'::uuid,
    (select alice from folks), 'S_TEST_GOD', 'comp', 200
  );

select is((select status from begun), 'pending', 'a new comp opening starts pending');
select is((select variant from begun), 'standard', 'the server starts before variant resolution');
select is((select comps_left from begun), 0, 'the comp is spent once');

create temp table ids as
  select public.fulfill_card_pack_opening(
    (select opening_id from begun),
    'god',
    jsonb_build_array(
      jsonb_build_object('slug','god-a','player_name','A','role','Mid','edition_week','2026-09-07','overall',84,'tier','diamond','foil',true,'foil_type','prisma','signed',false,'card_json','{"slug":"god-a"}'::jsonb),
      jsonb_build_object('slug','god-b','player_name','B','role','Top','edition_week','2026-09-07','overall',85,'tier','diamond','foil',true,'foil_type','aurora','signed',false,'card_json','{"slug":"god-b"}'::jsonb),
      jsonb_build_object('slug','god-c','player_name','C','role','Bot','edition_week','2026-09-07','overall',86,'tier','diamond','foil',true,'foil_type','refractor','signed',false,'card_json','{"slug":"god-c"}'::jsonb),
      jsonb_build_object('slug','god-d','player_name','D','role','Jungle','edition_week','2026-09-07','overall',90,'tier','master','foil',true,'foil_type','ice','signed',false,'card_json','{"slug":"god-d"}'::jsonb),
      jsonb_build_object('slug','god-e','player_name','E','role','Support','edition_week','2026-09-07','overall',95,'tier','challenger','foil',true,'foil_type','ice','signed',true,'card_json','{"slug":"god-e","autograph":"ink"}'::jsonb)
    )
  ) as card_ids;

select is((select jsonb_array_length(card_ids->'card_ids') from ids), 5, 'fulfillment inserts exactly five cards');
select is((select (card_ids->>'minted')::boolean from ids), true, 'the first fulfillment reports that it minted');
select is((select variant from public.card_pack_openings where opening_id = (select opening_id from begun)), 'god', 'the fulfilled opening stores the God variant');
select is((select array_length(reveal_order, 1) from public.card_pack_openings where opening_id = (select opening_id from begun)), 5, 'the opening stores a five-id reveal order');
select is((select count(*)::int from public.card_inventory where opening_id = (select opening_id from begun)), 5, 'all five copies carry the opening id');
select is((select count(*)::int from public.card_provenance where opening_id = (select opening_id from begun) and event = 'minted'), 5, 'all five mint events carry the opening id');

-- Same retry key returns the existing fulfilled opening without spending the
-- comp again or inserting a sixth card.
select is((select status from public.begin_card_pack_opening(
  '92020000-0000-4000-8000-000000000001'::uuid,
  (select alice from folks), 'S_TEST_GOD', 'comp', 200)), 'fulfilled', 'a retry reopens the fulfilled presentation');
create temp table retried as
  select public.fulfill_card_pack_opening(
    (select opening_id from begun),
    'god',
    (select prepared_cards from public.card_pack_openings where opening_id = (select opening_id from begun))
  ) as card_ids;
select is((select (card_ids->>'minted')::boolean from retried), false, 'a retry reports the existing fulfillment');
select is((select jsonb_array_length(card_ids->'card_ids') from retried), 5, 'a retry returns the original five ids');
select is((select count(*)::int from public.card_inventory where opening_id = (select opening_id from begun)), 5, 'a retry does not duplicate fulfillment');
select is((select remaining from public.card_pack_comps where discord_id = (select alice from folks) and kind = 'standard'), 0, 'a retry does not spend another comp');

select throws_ok(
  format($q$update public.card_inventory set opening_id = null where opening_id = %L::uuid$q$, (select opening_id from begun)),
  'P0001', 'pack provenance is immutable', 'a caller cannot rewrite a copy''s opening identity'
);

select * from finish();
rollback;
