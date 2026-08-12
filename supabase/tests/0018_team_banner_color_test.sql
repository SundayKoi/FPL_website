begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(4);

select has_column('public', 'teams', 'banner_color', 'teams has banner_color column');
-- col_default_is compares the EVALUATED default, so the expectation is the
-- value (#083344), not the expression text ('''#083344''::text').
select col_default_is('public', 'teams', 'banner_color', '#083344',
                     'teams banner_color defaults to the roster cyan banner');
select ok(exists(
  select 1
  from pg_constraint
  where conrelid = 'public.teams'::regclass
    and conname = 'teams_banner_color_hex_check'
), 'teams banner_color hex check exists');

select tests.fixture();
select tests.acting_as(tests.admin_id());
select lives_ok(
  $$update public.teams
    set banner_color = '#123456'
    where name = 'Team A'$$,
  'admin can update team banner color'
);

select * from finish();
rollback;
