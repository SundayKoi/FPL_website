-- league_teams accumulates every name the league has ever used and drives
-- captaincy, reporting and roster identity. Editing it by hand is what left
-- Astronauts and Wildcats retired while their captains could not report.
--
-- The freehand editor becomes owner-only. The guided sync functions stay
-- admin-callable: they are SECURITY DEFINER, idempotent, and only ever bring
-- the table into line with a draft, which is the safe path.

drop policy if exists league_teams_admin_write on public.league_teams;

create policy league_teams_owner_write on public.league_teams
  for all using (public.is_owner()) with check (public.is_owner());
