begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(16);

select test_profile(1000) as collector \gset
select test_profile(1000) as other_owner \gset

select has_table('public', 'season_end_auto_dust', 'Season''s End auto-dust has its own league-scoped settings');
select ok(not has_table_privilege('anon', 'public.season_end_auto_dust', 'select'), 'anonymous clients cannot read auto-dust settings');
select ok(not has_function_privilege('anon', 'public.run_season_end_auto_dust(text,text,uuid,integer)', 'execute'), 'anonymous clients cannot run auto-dust');
select ok(has_function_privilege('service_role', 'public.run_season_end_auto_dust(text,text,uuid,integer)', 'execute'), 'service role can run auto-dust');

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, economy_version, economy_payload, rules_payload, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001929', 'premier', 'S_TEST_0129', 'draft', 500, 'hash-0129', 'rules-0129', 'revision-0129', 'season-end-economy-2026-09-v1', '{"version":"season-end-economy-2026-09-v1","patronMultiplier":1.2,"signatureBonus":1200,"foilDustMultipliers":{"prisma":2},"baseSalvageByKind":{"season":20}}', '{"foilChance":0.04}', '{"calibratedPerCopyChance":0.01}', :'collector'),
  ('00000000-0000-0000-0000-000000001930', 'academy', 'A_TEST_0129', 'draft', 500, 'hash-0129a', 'rules-0129', 'revision-0129a', 'season-end-economy-2026-09-v1', '{"version":"season-end-economy-2026-09-v1","patronMultiplier":1.2,"signatureBonus":1200,"foilDustMultipliers":{"prisma":2},"baseSalvageByKind":{"season":20}}', '{"foilChance":0.04}', '{"calibratedPerCopyChance":0.01}', :'collector');
insert into public.season_end_designs (release_id, design_id, kind, payload, base_salvage)
values
  ('00000000-0000-0000-0000-000000001929', 'd1', 'season', '{}', 20),
  ('00000000-0000-0000-0000-000000001930', 'd1', 'season', '{}', 20);
update public.season_end_releases set state = 'public' where id in ('00000000-0000-0000-0000-000000001929', '00000000-0000-0000-0000-000000001930');

insert into public.season_end_openings
  (opening_id, request_id, discord_id, release_id, mode, status, price, outcome, revision_digest, economy_version, economy_payload, rules_version, rules_payload)
select ('00000000-0000-0000-0000-' || lpad((3000 + n)::text, 12, '0'))::uuid,
       ('00000000-0000-0000-0000-' || lpad((4000 + n)::text, 12, '0'))::uuid,
       :'collector', case when n = 6 then '00000000-0000-0000-0000-000000001930'::uuid else '00000000-0000-0000-0000-000000001929'::uuid end,
       'public', 'fulfilled', 500, '[]'::jsonb, 'revision-0129', 'season-end-economy-2026-09-v1', '{}'::jsonb, 'rules-0129', '{}'::jsonb
from generate_series(1, 6) n;
insert into public.season_end_inventory
  (release_id, opening_id, discord_id, mode, design_id, kind, payload, slot_position, reveal_order, revision_digest, economy_version, rules_version, foil, foil_type, signed, autograph)
select o.release_id, o.opening_id, :'collector', 'public', 'd1', 'season', '{}'::jsonb, 1, 1,
       'revision-0129', 'season-end-economy-2026-09-v1', 'rules-0129',
       n in (3, 4), case when n in (3, 4) then 'prisma' else null end, n = 5, case when n = 5 then 'signature' else null end
from generate_series(1, 6) n
join public.season_end_openings o on o.opening_id = ('00000000-0000-0000-0000-' || lpad((3000 + n)::text, 12, '0'))::uuid;

select * from public.run_season_end_auto_dust(:'collector', 'premier') \gset off_
select is(:'off_dusted'::integer, 0, 'disabled rule leaves every copy alone');

insert into public.season_end_auto_dust (discord_id, league, enabled) values (:'collector', 'premier', true);
select * from public.run_season_end_auto_dust(:'collector', 'premier', '00000000-0000-0000-0000-000000003002'::uuid) \gset opening_
select is(:'opening_dusted'::integer, 1, 'opening-scoped run dusts its duplicate');
select is((select lifecycle_status from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000003001'::uuid), 'active', 'oldest matte copy survives');
select is((select count(*)::integer from public.season_end_inventory where opening_id in ('00000000-0000-0000-0000-000000003003'::uuid, '00000000-0000-0000-0000-000000003004'::uuid) and lifecycle_status = 'active'), 2, 'opening-scoped run leaves other foil copies alone');

select * from public.run_season_end_auto_dust(:'collector', 'premier') \gset sweep_
select is(:'sweep_dusted'::integer, 1, 'full sweep clears the remaining exact duplicate');
select is((select lifecycle_status from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000003003'::uuid), 'active', 'oldest foil copy survives');
select is((select lifecycle_status from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000003005'::uuid), 'active', 'signed variant stays distinct');
select is((select lifecycle_status from public.season_end_inventory where opening_id = '00000000-0000-0000-0000-000000003006'::uuid), 'active', 'Academy copy stays in its league');
select is((select count(*)::integer from public.season_end_provenance where event = 'dusted' and discord_id = :'collector' and inventory_id in (select id from public.season_end_inventory where release_id = '00000000-0000-0000-0000-000000001929'::uuid)), 2, 'both dusts append provenance');
select is((select balance from public.betting_profiles where discord_id = :'collector'), 1060::bigint, 'dust credits the existing wallet through the authoritative RPC');

select * from public.run_season_end_auto_dust(:'collector', 'premier') \gset repeat_
select is(:'repeat_dusted'::integer, 0, 'repeat run is idempotent');
select throws_ok($$ select public.run_season_end_auto_dust('wrong-owner', 'premier', '00000000-0000-0000-0000-000000003001'::uuid) $$, 'P0001', 'Season''s End opening is not available', 'an opening cannot be auto-dusted for another owner');

select * from finish();
rollback;
