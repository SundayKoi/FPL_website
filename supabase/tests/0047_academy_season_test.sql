begin;
create extension if not exists pgtap with schema extensions;
\ir helpers/_fixtures.sql.inc
select plan(7);

select has_column('public', 'league_settings', 'academy_season', 'league_settings records the Academy season');
select is((select academy_season from public.league_settings where id = 1), 'A1',
          'the Academy starts on its own first-season code');
select col_not_null('public', 'league_settings', 'academy_season', 'the Academy season is always set');

select has_column('public', 'homepage_briefs', 'league', 'briefs record which homepage they belong to');
select is((select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'homepage_briefs' and column_name = 'league'),
          '''premier''::text', 'existing briefs stay on the Premier homepage');

-- The check constraint is what stops a brief being written for a league that
-- has no homepage to render it.
select throws_ok($$ insert into public.homepage_briefs (league, season) values ('reserves', 'A1') $$,
                 '23514', null, 'a brief cannot name an unknown league');
select lives_ok($$ insert into public.homepage_briefs (league, season) values ('academy', 'A1') $$,
                'an Academy brief inserts');

select * from finish();
rollback;
