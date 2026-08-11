begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select has_column('public', 'league_settings', 'current_season', 'current_season column exists');
select has_column('public', 'league_settings', 'current_phase', 'current_phase column exists');

-- The migration seeds the singleton row so the ingest script's fallback
-- read always finds one.
select results_eq(
  $$select current_season, current_phase from public.league_settings where id = 1$$,
  $$values ('S5'::text, 'Regular'::text)$$,
  'id=1 row seeded with S5 / Regular defaults'
);

-- Phase is constrained to the two rulebook phases.
prepare bad_phase as
  update public.league_settings set current_phase = 'Preseason' where id = 1;
select throws_ok('bad_phase', 23514, null, 'unknown phase rejected');

select lives_ok(
  $$update public.league_settings set current_phase = 'Playoffs', current_season = 'S6' where id = 1$$,
  'valid season/phase update succeeds'
);

select * from finish();
rollback;
