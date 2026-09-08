-- The match-codes policy asks a question anon is not allowed to ask.
--
-- match_codes_select (20260827000009) reads:
--
--   is_admin() or is_captain_of(a, season) or is_approved_team_member(a, season) ...
--
-- The first two keep Postgres's default PUBLIC execute grant. The third
-- revoked it and granted only authenticated and service_role. So a
-- signed-out visitor evaluating that policy does not simply get no rows —
-- the read raises 42501, "permission denied for function
-- is_approved_team_member". A policy helper has to be executable by every
-- role the policy can be evaluated under, or the policy is a trapdoor
-- rather than a filter.
--
-- Two pages read match_codes with the anon client, and both are wrong
-- today in different ways:
--
--   /match-draft/[fixtureId] documents spectators and the OBS overlay
--   getting an empty list. They do get an empty list, because the error is
--   ignored — but every spectator load and every overlay poll writes a
--   Postgres error, which is what floods the log during a live draft.
--
--   /my-team throws on any read error, so the page fails outright rather
--   than hiding codes the viewer may not see.
--
-- The grant leaks nothing. The body matches on auth.uid(), which is null
-- for anon, so it returns false for every row — the same answer the policy
-- wanted all along, arrived at without raising. This brings the function
-- in line with the two beside it in the same policy.

-- Granted by name rather than by signature, deliberately.
--
-- The first attempt at this wrote the signature out as (uuid, text), the
-- shape 20260827000009 declares, and Postgres answered "function
-- public.is_approved_team_member(uuid, text) does not exist" — while the
-- policy was busy raising "permission denied" for that same name, which
-- only happens when it DOES exist. So production carries it under some
-- other argument types. Rather than guess which, grant on every overload
-- of the name that is actually there.
--
-- Also covers the two helpers beside it in the policy. They rely on
-- Postgres's default PUBLIC execute grant today, which is why they have
-- never raised; making the grant explicit means a future `revoke ... from
-- public` on one of them cannot silently reopen this hole.
do $$
declare
  fn record;
  granted int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_approved_team_member', 'is_admin', 'is_captain_of')
  loop
    execute format('grant execute on function %s to anon', fn.sig);
    granted := granted + 1;
  end loop;

  if granted = 0 then
    raise exception
      'no match_codes policy helpers found in schema public — check the search path and the database';
  end if;

  raise notice 'granted execute on % match_codes policy helper(s) to anon', granted;
end
$$;
