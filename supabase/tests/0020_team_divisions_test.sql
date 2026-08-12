begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(6);

select has_column('public', 'teams', 'division', 'teams has division column');
select col_default_is('public', 'teams', 'division', 'NULL',
                     'teams division defaults to null');
select ok(exists(
  select 1
  from pg_constraint
  where conrelid = 'public.teams'::regclass
    and conname = 'teams_division_check'
), 'teams division check exists');

select tests.fixture();
select tests.acting_as(tests.admin_id());
select lives_ok(
  $$update public.teams set division = 'Lunari' where name = 'Team A'$$,
  'admin can assign Lunari'
);
select lives_ok(
  $$update public.teams set division = 'Solari' where name = 'Team A'$$,
  'admin can assign Solari'
);
prepare invalid_division as
  update public.teams set division = 'Invalid' where name = 'Team A';
select throws_ok('invalid_division', '23514', null, 'invalid division rejected');

select * from finish();
rollback;
