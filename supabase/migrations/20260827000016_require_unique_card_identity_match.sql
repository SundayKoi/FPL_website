-- Require a card claim's Riot ID to identify exactly one player across the
-- configured active rosters before creating a canonical identity link.
create or replace function public.approve_card_claim(
  p_season text,
  p_summoner text,
  p_tag text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.card_claims%rowtype;
  v_candidate_player_id uuid;
  v_league_team_id uuid;
  v_candidate_count integer;
  v_league text;
  v_has_exact_identity boolean;
  v_has_conflict boolean;
begin
  select c.*
  into v_claim
  from public.card_claims c
  where c.season = p_season
    and c.summoner_name = p_summoner
    and c.tag = p_tag
    and c.status = 'pending'
    and public.can_moderate_card(c.season, c.summoner_name, c.tag)
  for update;

  if not found then
    raise exception 'CARD_CLAIM_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if not public.can_moderate_card(
    v_claim.season, v_claim.summoner_name, v_claim.tag
  ) then
    raise exception 'CARD_CLAIM_FORBIDDEN';
  end if;

  update public.card_claims
  set status = 'approved',
      decided_by = (select auth.uid()),
      decided_at = now()
  where season = v_claim.season
    and summoner_name = v_claim.summoner_name
    and tag = v_claim.tag;

  if v_claim.player_pool_id is null then
    return;
  end if;

  select
    count(*)::integer,
    (array_agg(candidate.player_pool_id order by candidate.player_pool_id))[1],
    (array_agg(candidate.league_team_id order by candidate.league_team_id))[1],
    min(candidate.league)
  into
    v_candidate_count,
    v_candidate_player_id,
    v_league_team_id,
    v_league
  from (
    select distinct
      configured.league,
      p.canonical_player_id as player_pool_id,
      lt.id as league_team_id
    from public.league_settings settings
    cross join lateral (
      values
        ('premier'::text, settings.current_season, settings.featured_draft_id),
        ('academy'::text, settings.academy_season, settings.academy_draft_id)
    ) as configured(league, season, draft_id)
    join public.players p
      on p.draft_id = configured.draft_id
    join public.player_pool pp on pp.id = p.canonical_player_id
    join public.teams t
      on t.id = p.team_id
     and t.draft_id = p.draft_id
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(t.name))
     and lt.active
    where settings.id = 1
      and configured.season = v_claim.season
      and public.card_claim_matches_opgg(
        v_claim.summoner_name,
        v_claim.tag,
        pp.opgg_url
      )
  ) candidate;

  if v_candidate_count <> 1
     or v_candidate_player_id is distinct from v_claim.player_pool_id then
    raise exception 'CARD_IDENTITY_MISMATCH';
  end if;

  perform 1
  from public.player_identity_links pil
  where pil.league = v_league
    and pil.season = v_claim.season
    and (
      pil.player_pool_id = v_claim.player_pool_id
      or pil.profile_id = v_claim.profile_id
    )
  order by pil.id
  for update;

  select
    coalesce(bool_or(
      pil.player_pool_id = v_claim.player_pool_id
      and pil.profile_id = v_claim.profile_id
      and pil.league_team_id = v_league_team_id
    ), false),
    coalesce(bool_or(
      pil.player_pool_id <> v_claim.player_pool_id
      or pil.profile_id <> v_claim.profile_id
      or pil.league_team_id is distinct from v_league_team_id
    ), false)
  into v_has_exact_identity, v_has_conflict
  from public.player_identity_links pil
  where pil.league = v_league
    and pil.season = v_claim.season
    and (
      pil.player_pool_id = v_claim.player_pool_id
      or pil.profile_id = v_claim.profile_id
    );

  if v_has_conflict then
    raise exception 'PLAYER_IDENTITY_CONFLICT';
  end if;

  if v_has_exact_identity then
    update public.player_identity_links
    set status = 'approved',
        decided_by = (select auth.uid()),
        decided_at = now()
    where player_pool_id = v_claim.player_pool_id
      and profile_id = v_claim.profile_id
      and league_team_id = v_league_team_id
      and league = v_league
      and season = v_claim.season
      and status = 'pending';
  else
    insert into public.player_identity_links (
      player_pool_id,
      profile_id,
      league_team_id,
      league,
      season,
      status,
      source,
      requested_by,
      decided_by,
      decided_at
    ) values (
      v_claim.player_pool_id,
      v_claim.profile_id,
      v_league_team_id,
      v_league,
      v_claim.season,
      'approved',
      'card',
      v_claim.profile_id,
      (select auth.uid()),
      now()
    );
  end if;
end
$$;

revoke all on function public.approve_card_claim(text, text, text)
  from public, anon;
grant execute on function public.approve_card_claim(text, text, text)
  to authenticated, service_role;
