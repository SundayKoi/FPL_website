-- Auto-dust: the per-edition switch is a real, defaulted column.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(3);

select test_profile(0) as dana \gset

select has_column('public', 'card_auto_dust', 'per_edition', 'the per-edition switch exists');

select lives_ok(
  format($q$ insert into card_auto_dust (discord_id, enabled, max_tier, max_overall, keep_copies) values (%L, true, 'gold', 70, 1) $q$, :'dana'),
  'a rule written without the switch still saves');
select is(
  (select per_edition from card_auto_dust where discord_id = :'dana'), false,
  'and defaults to grouping by player, the behaviour every existing rule keeps');

select * from finish();
rollback;
