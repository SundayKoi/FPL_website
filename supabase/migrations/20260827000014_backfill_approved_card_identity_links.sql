-- Backfill My Team identities for card claims approved before canonical
-- identity links existed. Only one exact Riot ID in one configured active
-- roster is eligible; ambiguous, stale, or conflicting claims remain
-- card-only for an administrator to resolve explicitly.

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
    -- Never overwrite either side of a canonical identity. A conflict needs
    -- an explicit admin decision, not a data-migration guess.
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

-- This maintenance write bypasses RLS by design, so it is not a public RPC.
revoke all on function public.sync_approved_card_claim_identities()
  from public, anon, authenticated;
grant execute on function public.sync_approved_card_claim_identities()
  to service_role;

select public.sync_approved_card_claim_identities();
