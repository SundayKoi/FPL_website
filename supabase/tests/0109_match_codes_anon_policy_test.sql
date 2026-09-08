-- Every helper the match_codes policy calls must be executable by every
-- role the policy is evaluated under. When one is not, a signed-out read
-- raises 42501 instead of returning no rows — see 20261003000002.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(has_function_privilege('anon', 'public.is_approved_team_member(uuid, text)', 'execute'),
  'anon may evaluate is_approved_team_member, so the policy filters instead of raising');
select ok(has_function_privilege('anon', 'public.is_admin()', 'execute'),
  'anon may evaluate is_admin');
select ok(has_function_privilege('anon', 'public.is_captain_of(uuid, text)', 'execute'),
  'anon may evaluate is_captain_of');

select * from finish();
rollback;
