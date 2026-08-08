-- PostgREST requires explicit table grants (local config does not auto-expose).
-- RLS policies remain the real gate; these grants are the outer door.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.profiles, public.drafts, public.teams,
                public.players, public.lots, public.bids
  to anon, authenticated;

-- admin setup CRUD happens as direct writes under admin RLS policies (Task 15)
grant insert, update, delete on public.drafts, public.teams, public.players
  to authenticated;

-- service_role bypasses RLS and needs full access (e2e seeding, admin API)
grant all on all tables in schema public to service_role;

grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
