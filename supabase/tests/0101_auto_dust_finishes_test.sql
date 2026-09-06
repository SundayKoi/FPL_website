-- Auto-dust and the finishes: the toggle exists, and it starts on.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(2);

select test_profile(0) as dana \gset

select has_column('public', 'card_auto_dust', 'skip_finishes', 'a rule knows whether it may melt a finish');

insert into public.card_auto_dust (discord_id, enabled, max_tier, max_overall, keep_copies)
values (:'dana', true, 'silver', 60, 1);
select is(
  (select skip_finishes from public.card_auto_dust where discord_id = :'dana'), true,
  'and it starts by keeping them');

select * from finish();
rollback;
