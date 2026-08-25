-- Captains may decide pending claims for their exact roster, but revoking an
-- already-approved identity is an administrative action. Preserve claimant
-- self-withdrawal for pending rows and unrestricted admin revocation.

drop policy player_identity_links_delete
  on public.player_identity_links;

create policy player_identity_links_delete
  on public.player_identity_links
  for delete
  to authenticated
  using (
    public.is_admin()
    or (
      profile_id = (select auth.uid())
      and status = 'pending'
    )
    or (
      status = 'pending'
      and league_team_id is not null
      and public.is_captain_of(league_team_id, season)
      and public.is_player_rostered_on_team(
        player_pool_id, league_team_id, league, season
      )
    )
  );
