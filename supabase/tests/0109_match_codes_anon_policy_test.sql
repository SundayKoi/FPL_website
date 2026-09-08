-- Every helper the match_codes policy calls must be executable by every
-- role the policy is evaluated under. When one is not, a signed-out read
-- raises 42501 instead of returning no rows — see 20261003000002.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  has_function_privilege('anon', 'public.is_approved_team_member(uuid, text)', 'execute'),
  'anon may evaluate is_approved_team_member, so the policy filters instead of raising');
select ok(
  has_function_privilege('anon', 'public.is_admin()', 'execute'),
  'anon may evaluate is_admin');
select ok(
  has_function_privilege('anon', 'public.is_captain_of(uuid, text)', 'execute'),
  'anon may evaluate is_captain_of');

-- The point of the grant: anon gets false, never rows and never an error.
select is(
  public.is_approved_team_member('00000000-0000-0000-0000-000000000000'::uuid, 'S5'),
  false,
  'with no session the helper answers false rather than raising');

select * from finish();
rollback;
