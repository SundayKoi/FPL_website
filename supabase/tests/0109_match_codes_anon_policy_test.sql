-- Every helper the match_codes policy calls must be executable by every
-- role the policy is evaluated under. When one is not, a signed-out read
-- raises 42501 instead of returning no rows — see 20261003000002.
--
-- Asserted by NAME, not by signature: production carries
-- is_approved_team_member under different argument types than
-- 20260827000009 declares, which is what made the first grant fail.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_approved_team_member', 'is_admin', 'is_captain_of')
      and not has_function_privilege('anon', p.oid, 'execute')),
  0,
  'anon may evaluate every match_codes policy helper, so the policy filters instead of raising');

select ok(
  (select count(*) > 0
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_approved_team_member'),
  'the helper the policy names is actually present');

select * from finish();
rollback;
