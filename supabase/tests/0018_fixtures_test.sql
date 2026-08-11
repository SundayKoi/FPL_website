begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public', 'fixtures', 'fixtures exists');
select has_column('public', 'fixtures', 'stage', 'stage column exists');
select has_column('public', 'fixtures', 'scheduled_at', 'scheduled_at column exists');

-- Public read, no anonymous writes.
select ok(has_table_privilege('anon', 'public.fixtures', 'select'), 'anon reads fixtures');
select ok(not has_table_privilege('anon', 'public.fixtures', 'insert'), 'anon cannot insert fixtures');

-- RLS is on (authenticated writes still gate through the is_admin() policy).
select ok((select relrowsecurity from pg_class where oid = 'public.fixtures'::regclass), 'fixtures RLS enabled');

-- best_of is constrained to real series lengths.
prepare bad_best_of as
  insert into public.fixtures (stage, best_of) values ('week_1', 2);
select throws_ok('bad_best_of', 23514, null, 'best_of outside 1/3/5 rejected');

-- Scores land together or not at all.
prepare half_score as
  insert into public.fixtures (stage, best_of, score_a) values ('week_1', 3, 2);
select throws_ok('half_score', 23514, null, 'half-reported score rejected');

-- Division is limited to the two rulebook divisions.
prepare bad_division as
  insert into public.fixtures (stage, best_of, division) values ('week_1', 3, 'Midlands');
select throws_ok('bad_division', 23514, null, 'unknown division rejected');

-- A TBD fixture (no teams, no date) is representable.
select lives_ok(
  $$insert into public.fixtures (stage, best_of, division) values ('week_1', 3, 'Solari')$$,
  'TBD fixture with null teams/date inserts'
);

select * from finish();
rollback;
