begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
\ir helpers/_season_end_report.sql.inc
select plan(5);

select test_profile(5000) as first_owner \gset
select test_profile(5000) as other_owner \gset

insert into public.season_end_releases
  (id, league, season, state, price, catalog_hash, rules_version, revision_digest, signature_calibration, created_by)
values
  ('00000000-0000-0000-0000-000000001935', 'premier', 'S_TEST_0135', 'public', 500,
   'hash-0135', 'rules-0135', 'revision-0135',
   '{"calibratedPerCopyChance":0.01,"achievablePackProbability":0.01}', :'first_owner');

select * from public.begin_season_end_opening(
  '00000000-0000-0000-0000-000000002535'::uuid,
  :'first_owner',
  '00000000-0000-0000-0000-000000001935'::uuid,
  'public'
) \gset first_

select throws_ok(
  format($$ select * from public.begin_season_end_opening(%L::uuid, %L, %L::uuid, %L) $$,
    '00000000-0000-0000-0000-000000002535', :'other_owner',
    '00000000-0000-0000-0000-000000001935', 'public'),
  'P0001',
  'request id belongs to another user',
  'a different account cannot claim a charged opening request'
);
select is(
  (select count(*)::int from public.season_end_openings where request_id = '00000000-0000-0000-0000-000000002535'::uuid),
  1,
  'the foreign retry does not create another opening'
);
select is(
  (select balance from public.betting_profiles where discord_id = :'other_owner'),
  5000::bigint,
  'the foreign retry leaves the other account wallet unchanged'
);
select is(
  (select count(*)::int from public.betting_ledger
    where discord_id = :'other_owner' and reason = 'card_pack' and ref_table = 'card_pack_opens'),
  0,
  'the foreign retry writes no pack debit'
);
select is(
  (select count(*)::int from public.season_end_openings
    where opening_id = :'first_opening_id'::uuid and discord_id = :'first_owner'),
  1,
  'the original charged receipt remains owned by its first account'
);

select * from finish();
rollback;
