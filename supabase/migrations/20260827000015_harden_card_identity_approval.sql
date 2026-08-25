-- Card approval is an RPC-only transition. Captain moderation follows the
-- configured active draft and exact canonical Riot metadata, matching the
-- identity resolver instead of the legacy roster_memberships table.

create or replace function public.can_moderate_card(
  p_season text,
  p_summoner text,
  p_tag text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1
    from public.league_settings settings
    cross join lateral (
      values
        ('premier'::text, settings.current_season, settings.featured_draft_id),
        ('academy'::text, settings.academy_season, settings.academy_draft_id)
    ) as configured(league, season, draft_id)
    join public.players p on p.draft_id = configured.draft_id
    join public.player_pool pp on pp.id = p.canonical_player_id
    join public.teams t
      on t.id = p.team_id
     and t.draft_id = p.draft_id
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(t.name))
     and lt.active
    where settings.id = 1
      and configured.season = p_season
      and public.card_claim_matches_opgg(
        p_summoner,
        p_tag,
        pp.opgg_url
      )
      and public.is_captain_of(lt.id, configured.season)
  )
$$;

revoke all on function public.can_moderate_card(text, text, text)
  from public, anon;
grant execute on function public.can_moderate_card(text, text, text)
  to authenticated, service_role;

drop policy if exists card_claims_update on public.card_claims;
revoke update on public.card_claims from authenticated;

-- Keep a conflicting historical claim fully untouched. In particular, do
-- not attach its card row to a canonical player unless the identity link can
-- also be inserted without displacing either an existing player or profile.
create or replace function public.sync_approved_card_claim_identities()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  inserted_count integer := 0;
begin
  for candidate in
    select
      cc.season,
      cc.summoner_name,
      cc.tag,
      cc.profile_id,
      cc.created_at,
      cc.decided_by,
      cc.decided_at,
      (array_agg(distinct p.canonical_player_id))[1] as player_pool_id,
      (array_agg(distinct lt.id))[1] as league_team_id,
      (array_agg(distinct configured.league))[1] as league
    from public.card_claims cc
    join public.league_settings settings on settings.id = 1
    cross join lateral (
      values
        ('premier'::text, settings.current_season, settings.featured_draft_id),
        ('academy'::text, settings.academy_season, settings.academy_draft_id)
    ) as configured(league, season, draft_id)
    join public.players p on p.draft_id = configured.draft_id
    join public.player_pool pp on pp.id = p.canonical_player_id
    join public.teams t
      on t.id = p.team_id
     and t.draft_id = p.draft_id
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(t.name))
     and lt.active
    where cc.status = 'approved'
      and cc.season = configured.season
      and cc.decided_by is not null
      and cc.decided_at is not null
      and public.card_claim_matches_opgg(
        cc.summoner_name,
        cc.tag,
        pp.opgg_url
      )
    group by
      cc.season,
      cc.summoner_name,
      cc.tag,
      cc.profile_id,
      cc.created_at,
      cc.decided_by,
      cc.decided_at
    having count(distinct row(
      p.canonical_player_id,
      lt.id,
      configured.league
    )) = 1
  loop
    if exists (
      select 1
      from public.player_identity_links pil
      where pil.league = candidate.league
        and pil.season = candidate.season
        and (
          pil.player_pool_id = candidate.player_pool_id
          or pil.profile_id = candidate.profile_id
        )
    ) then
      continue;
    end if;

    update public.card_claims
    set player_pool_id = candidate.player_pool_id
    where season = candidate.season
      and summoner_name = candidate.summoner_name
      and tag = candidate.tag
      and player_pool_id is distinct from candidate.player_pool_id;

    insert into public.player_identity_links (
      player_pool_id,
      profile_id,
      league_team_id,
      league,
      season,
      status,
      source,
      requested_by,
      requested_at,
      decided_by,
      decided_at
    ) values (
      candidate.player_pool_id,
      candidate.profile_id,
      candidate.league_team_id,
      candidate.league,
      candidate.season,
      'approved',
      'card',
      candidate.profile_id,
      candidate.created_at,
      candidate.decided_by,
      candidate.decided_at
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end
$$;

revoke all on function public.sync_approved_card_claim_identities()
  from public, anon, authenticated;
grant execute on function public.sync_approved_card_claim_identities()
  to service_role;
