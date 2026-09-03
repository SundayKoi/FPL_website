-- Auto-dust rules: one per collector, deny-all, bounded.

begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
\ir helpers/_betting_fixtures.sql.inc
select plan(7);

select test_profile(0) as dana \gset

select has_table('public', 'card_auto_dust', 'the rule table exists');
select is((select relrowsecurity from pg_class where oid = 'public.card_auto_dust'::regclass), true, 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'card_auto_dust'), 0, 'no policy opens it to a player');
select ok(not has_table_privilege('authenticated', 'public.card_auto_dust', 'SELECT'), 'a player cannot read rules directly');

select lives_ok(
  format($q$ insert into card_auto_dust (discord_id, enabled, max_tier, max_overall, keep_copies) values (%L, true, 'gold', 70, 2) $q$, :'dana'),
  'a rule can be written for a collector');
select throws_ok(
  format($q$ update card_auto_dust set max_tier = 'mythic' where discord_id = %L $q$, :'dana'),
  23514, null, 'an unknown rarity is refused');
select throws_ok(
  format($q$ update card_auto_dust set keep_copies = 11 where discord_id = %L $q$, :'dana'),
  23514, null, 'keeping more than ten copies is refused');

select * from finish();
rollback;
