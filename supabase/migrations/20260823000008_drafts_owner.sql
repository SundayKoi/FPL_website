-- Setting a draft up is owner work; running one is admin work.
--
-- Deleting a draft cascades to its teams and players, and the player pool and
-- free-agency averages are the draft's economics. The live draft actions
-- (start, pause, nominate, place_bid, close_lot, admin assignment, undo) are
-- SECURITY DEFINER RPCs guarded by _require_admin(), so they bypass these
-- policies and keep working for any admin. That split is deliberate.

drop policy if exists drafts_admin_write  on public.drafts;
drop policy if exists players_admin_write on public.players;

create policy drafts_owner_write on public.drafts
  for all using (public.is_owner()) with check (public.is_owner());
create policy players_owner_write on public.players
  for all using (public.is_owner()) with check (public.is_owner());

drop policy if exists free_agency_avg_bids_admin_write on public.free_agency_avg_bids;
create policy free_agency_avg_bids_owner_write on public.free_agency_avg_bids
  for all using (public.is_owner()) with check (public.is_owner());
