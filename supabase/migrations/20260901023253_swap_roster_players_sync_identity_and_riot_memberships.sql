-- Keep canonical team ownership in step with an admin roster trade.
--
-- `players.team_id` is draft-local roster truth. Current-season
-- `player_identity_links` and `roster_memberships` are the other team-scoped
-- records used by My Team, scouting, match-code access, and card tooling.
-- Historical rows intentionally remain unchanged: they describe the team
-- that owned the player or Riot account at that time.

create or replace function public.swap_roster_players(
  p_left_player_id uuid,
  p_right_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left public.players;
  v_right public.players;
  v_left_team_id uuid;
  v_right_team_id uuid;
  v_left_acquisition public.acquisition_type;
  v_right_acquisition public.acquisition_type;
  v_league text;
  v_season text;
  v_left_league_team_id uuid;
  v_right_league_team_id uuid;
  v_left_league_team_count integer;
  v_right_league_team_count integer;
begin
  perform public._require_admin();

  if p_left_player_id is null or p_right_player_id is null then
    raise exception 'PLAYER_NOT_FOUND: both players are required';
  end if;
  if p_left_player_id = p_right_player_id then
    raise exception 'SAME_PLAYER: choose two different players';
  end if;

  -- Lock in deterministic ID order so simultaneous admin swaps cannot deadlock.
  perform 1
  from public.players
  where id in (p_left_player_id, p_right_player_id)
  order by id
  for update;

  select * into v_left from public.players where id = p_left_player_id;
  select * into v_right from public.players where id = p_right_player_id;

  if v_left.id is null or v_right.id is null then
    raise exception 'PLAYER_NOT_FOUND: player not found';
  end if;
  if v_left.team_id is null or v_right.team_id is null then
    raise exception 'PLAYER_UNASSIGNED: both players must be rostered';
  end if;
  if v_left.draft_id <> v_right.draft_id then
    raise exception 'DRAFT_MISMATCH: players must share a draft';
  end if;
  if v_left.team_id = v_right.team_id then
    raise exception 'SAME_TEAM: players must be on different teams';
  end if;
  if v_left.role <> v_right.role then
    raise exception 'ROLE_MISMATCH: players must share a role';
  end if;
  if v_left.acquisition = 'captain' or v_right.acquisition = 'captain' then
    raise exception 'CAPTAIN_LOCKED: captains cannot be traded';
  end if;
  if v_left.canonical_player_id is not null
     and v_left.canonical_player_id = v_right.canonical_player_id then
    raise exception 'CANONICAL_PLAYER_CONFLICT: players cannot share a canonical identity';
  end if;

  v_left_team_id := v_left.team_id;
  v_right_team_id := v_right.team_id;
  v_left_acquisition := v_left.acquisition;
  v_right_acquisition := v_right.acquisition;

  -- A draft is current only when it is the configured Premier or Academy
  -- draft. This keeps old draft links and memberships historical.
  select case
           when v_left.draft_id = settings.featured_draft_id then 'premier'
           when v_left.draft_id = settings.academy_draft_id then 'academy'
         end,
         case
           when v_left.draft_id = settings.featured_draft_id then settings.current_season
           when v_left.draft_id = settings.academy_draft_id then settings.academy_season
         end
    into v_league, v_season
    from public.league_settings settings
   where settings.id = 1;

  if v_league is not null then
    if v_season is null then
      raise exception 'CURRENT_SEASON_MISSING: configured current roster has no season';
    end if;

    -- Resolve both draft-local teams to exactly one active canonical team.
    -- A missing or ambiguous mapping would leave private permissions stale, so
    -- fail before changing any row.
    select count(*)::integer, (array_agg(lt.id order by lt.id))[1]
      into v_left_league_team_count, v_left_league_team_id
      from public.teams t
      join public.league_teams lt
       on lower(trim(lt.name)) = lower(trim(t.name))
       and lt.active
     where t.id = v_left_team_id
       and t.draft_id = v_left.draft_id;
    select count(*)::integer, (array_agg(lt.id order by lt.id))[1]
      into v_right_league_team_count, v_right_league_team_id
      from public.teams t
      join public.league_teams lt
       on lower(trim(lt.name)) = lower(trim(t.name))
       and lt.active
     where t.id = v_right_team_id
       and t.draft_id = v_right.draft_id;

    if v_left_league_team_count <> 1
       or v_right_league_team_count <> 1
       or v_left_league_team_id = v_right_league_team_id then
      raise exception 'LEAGUE_TEAM_MAPPING_INVALID: current roster teams must map to one active league team';
    end if;
  end if;

  -- Clear both fields first so the existing one-player-per-role index and the
  -- players team/acquisition check constraint allow the swap staging step.
  update public.players
     set team_id = null, acquisition = null
   where id in (v_left.id, v_right.id);

  if v_league is not null then
    -- Canonical identity links have a player_pool foreign key. Move every
    -- current-season status, including pending claims; no display-name match
    -- is used here.
    update public.player_identity_links
       set league_team_id = v_right_league_team_id
     where player_pool_id = v_left.canonical_player_id
       and league = v_league
       and season = v_season;
    update public.player_identity_links
       set league_team_id = v_left_league_team_id
     where player_pool_id = v_right.canonical_player_id
       and league = v_league
       and season = v_season;

    -- roster_memberships has no canonical player foreign key. Restrict the
    -- move to memberships currently on the player's old canonical team whose
    -- Riot ID appears exactly in either the draft player's OP.GG URL or its
    -- canonical player's OP.GG URL. No display-name fallback is allowed.
    -- One UPDATE reads each membership's old team once. This prevents a
    -- membership that happens to match both exact URLs from being moved twice
    -- by the two sides of the trade.
    update public.roster_memberships rm
       set league_team_id = case
         when rm.league_team_id = v_left_league_team_id then v_right_league_team_id
         else v_left_league_team_id
       end
      from public.riot_accounts ra
     where rm.riot_account_id = ra.id
       and rm.season = v_season
       and (
         (
           rm.league_team_id = v_left_league_team_id
           and (
             public.card_claim_matches_opgg(ra.game_name, ra.tag_line, v_left.opgg_url)
             or exists (
               select 1
                 from public.player_pool pp
                where pp.id = v_left.canonical_player_id
                  and public.card_claim_matches_opgg(ra.game_name, ra.tag_line, pp.opgg_url)
             )
           )
         )
         or (
           rm.league_team_id = v_right_league_team_id
           and (
             public.card_claim_matches_opgg(ra.game_name, ra.tag_line, v_right.opgg_url)
             or exists (
               select 1
                 from public.player_pool pp
                where pp.id = v_right.canonical_player_id
                  and public.card_claim_matches_opgg(ra.game_name, ra.tag_line, pp.opgg_url)
             )
           )
         )
       );
  end if;

  update public.players
     set team_id = v_right_team_id,
         acquisition = v_left_acquisition,
         auto_assigned_from_lot_id = null
   where id = v_left.id;
  update public.players
     set team_id = v_left_team_id,
         acquisition = v_right_acquisition,
         auto_assigned_from_lot_id = null
   where id = v_right.id;
end;
$$;

revoke all on function public.swap_roster_players(uuid, uuid) from public;
grant execute on function public.swap_roster_players(uuid, uuid) to authenticated, service_role;

-- The backfill runs as the trusted postgres migration role. The swap RPC also
-- runs as its postgres-owned SECURITY DEFINER, after _require_admin() has
-- authenticated the caller. Permit that trusted path through the existing
-- captain-decision immutability trigger; ordinary callers still hit the full
-- admin/service-role/captain checks in the trigger.
create or replace function public.enforce_player_identity_decision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_admin()
     or coalesce((select auth.jwt()->>'role'), '') = 'service_role'
     or current_user = 'postgres' then
    return new;
  end if;

  if row(
    new.player_pool_id,
    new.profile_id,
    new.league_team_id,
    new.league,
    new.season,
    new.requested_by,
    new.source,
    new.requested_at
  ) is distinct from row(
    old.player_pool_id,
    old.profile_id,
    old.league_team_id,
    old.league,
    old.season,
    old.requested_by,
    old.source,
    old.requested_at
  ) then
    raise exception 'IDENTITY_DECISION_IMMUTABLE: identity request fields cannot change during captain approval';
  end if;

  if old.status <> 'pending' or new.status <> 'approved' then
    raise exception 'IDENTITY_DECISION_TRANSITION: captains may only approve pending identity requests';
  end if;

  if new.decided_by is distinct from (select auth.uid()) then
    raise exception 'IDENTITY_DECIDER_MISMATCH: decided_by must identify the approving captain';
  end if;

  if new.decided_at is null then
    raise exception 'IDENTITY_DECISION_TIME_REQUIRED: decided_at is required for captain approval';
  end if;

  return new;
end
$$;

-- Repair current-season rows left stale by earlier versions of the swap RPC.
-- Identity links move only when one canonical player resolves to one active
-- canonical team. Riot memberships move only when one Riot ID resolves to one
-- current roster team through exact OP.GG metadata; ambiguous matches remain
-- untouched for human review. Historical seasons are excluded by construction.
do $$
begin
  with active_players as (
    select configured.league,
           configured.season,
           p.canonical_player_id,
           lt.id as league_team_id
      from public.league_settings settings
      cross join lateral (
        values
          ('premier'::text, settings.current_season, settings.featured_draft_id),
          ('academy'::text, settings.academy_season, settings.academy_draft_id)
      ) as configured(league, season, draft_id)
      join public.players p
        on p.draft_id = configured.draft_id
       and p.team_id is not null
       and p.canonical_player_id is not null
      join public.teams t
        on t.id = p.team_id
       and t.draft_id = p.draft_id
      join public.league_teams lt
        on lower(trim(lt.name)) = lower(trim(t.name))
       and lt.active
     where settings.id = 1
       and configured.season is not null
       and configured.draft_id is not null
  ), unique_identity_destinations as (
    select league,
           season,
           canonical_player_id,
           (array_agg(league_team_id order by league_team_id))[1] as league_team_id
      from active_players
     group by league, season, canonical_player_id
    having count(distinct league_team_id) = 1
  )
  update public.player_identity_links pil
     set league_team_id = destination.league_team_id
    from unique_identity_destinations destination
   where pil.player_pool_id = destination.canonical_player_id
     and pil.league = destination.league
     and pil.season = destination.season
     and pil.league_team_id is distinct from destination.league_team_id;

  with active_players as (
    select configured.season,
           p.opgg_url as player_opgg_url,
           pp.opgg_url as canonical_opgg_url,
           lt.id as league_team_id
      from public.league_settings settings
      cross join lateral (
        values
          (settings.current_season, settings.featured_draft_id),
          (settings.academy_season, settings.academy_draft_id)
      ) as configured(season, draft_id)
      join public.players p
        on p.draft_id = configured.draft_id
       and p.team_id is not null
      left join public.player_pool pp
        on pp.id = p.canonical_player_id
      join public.teams t
        on t.id = p.team_id
       and t.draft_id = p.draft_id
      join public.league_teams lt
        on lower(trim(lt.name)) = lower(trim(t.name))
       and lt.active
     where settings.id = 1
       and configured.season is not null
       and configured.draft_id is not null
  ), unique_membership_destinations as (
    select rm.id,
           (array_agg(active_players.league_team_id order by active_players.league_team_id))[1] as league_team_id
      from public.roster_memberships rm
      join public.riot_accounts ra
        on ra.id = rm.riot_account_id
      join active_players
        on active_players.season = rm.season
       and (
         public.card_claim_matches_opgg(
           ra.game_name, ra.tag_line, active_players.player_opgg_url
         )
         or public.card_claim_matches_opgg(
           ra.game_name, ra.tag_line, active_players.canonical_opgg_url
         )
       )
     group by rm.id
    having count(distinct active_players.league_team_id) = 1
  )
  update public.roster_memberships rm
     set league_team_id = destination.league_team_id
    from unique_membership_destinations destination
   where rm.id = destination.id
     and rm.league_team_id is distinct from destination.league_team_id;
end
$$;
