-- Fixtures split by operation, which is the one place RLS expresses the tier
-- line natively: admins report results every week, owners decide what the
-- season looks like. Creating and deleting fixtures detaches tourney codes and
-- match reports (both reference fixture_id with on delete set null).
--
-- Accepted limit: an admin UPDATE covers the whole row, so an admin can edit a
-- fixture's teams or date as well as its score. Freezing those columns needs an
-- OLD/NEW trigger; deliberately not done, since admins are trusted staff and a
-- wrong team name is trivially reversible.

drop policy if exists fixtures_admin_write on public.fixtures;

create policy fixtures_admin_update on public.fixtures
  for update using (public.is_admin()) with check (public.is_admin());
create policy fixtures_owner_insert on public.fixtures
  for insert with check (public.is_owner());
create policy fixtures_owner_delete on public.fixtures
  for delete using (public.is_owner());
