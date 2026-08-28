-- Temporary testing gate: FPL'dle is available only to site admins.
-- Grants keep the Data API outer door closed to anonymous callers; RLS keeps
-- authenticated non-admin callers out as well.

revoke all on table public.fpldle_daily_candidates from anon, authenticated;
grant select on table public.fpldle_daily_candidates to authenticated;
grant all on table public.fpldle_daily_candidates to service_role;

drop policy if exists fpldle_daily_candidates_public_read
  on public.fpldle_daily_candidates;

create policy fpldle_daily_candidates_admin_read
  on public.fpldle_daily_candidates
  for select
  to authenticated
  using (public.is_admin());
