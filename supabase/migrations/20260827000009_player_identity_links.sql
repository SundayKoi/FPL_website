-- Canonical player-to-profile identities for My Team access.
--
-- Raw links are private. Public callers receive only the neutral state from
-- player_identity_state(); authenticated reads remain scoped by RLS to the
-- claimant, their team captain, or an admin.

create table if not exists public.player_identity_links (
  id uuid primary key default gen_random_uuid(),
  player_pool_id uuid not null references public.player_pool(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  league_team_id uuid references public.league_teams(id) on delete set null,
  league text not null check (league in ('premier', 'academy')),
  season text not null,
  status text not null check (status in ('pending', 'approved')),
  source text not null check (source in ('admin', 'team', 'card')),
  requested_by uuid not null references public.profiles(id) on delete cascade,
  decided_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  check (
    (status = 'pending' and decided_by is null and decided_at is null)
    or (status = 'approved' and decided_by is not null and decided_at is not null)
  ),
  unique (player_pool_id, league, season),
  unique (profile_id, league, season)
);

create index if not exists player_identity_links_team_season_idx
  on public.player_identity_links (league_team_id, season)
  where league_team_id is not null;
create index if not exists player_identity_links_requested_by_idx
  on public.player_identity_links (requested_by);
create index if not exists player_identity_links_decided_by_idx
  on public.player_identity_links (decided_by)
  where decided_by is not null;

-- Exact canonical roster proof. A player is rostered only when the supplied
-- league/season selects the active draft in league_settings and that draft's
-- normalized team name resolves to the supplied canonical league team.
create or replace function public.is_player_rostered_on_team(
  p_player_pool_id uuid,
  p_league_team_id uuid,
  p_league text,
  p_season text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    join public.teams t
      on t.id = p.team_id
     and t.draft_id = p.draft_id
    join public.league_teams lt
      on lt.id = p_league_team_id
     and lower(trim(lt.name)) = lower(trim(t.name))
     and lt.active
    join public.league_settings settings on settings.id = 1
    where p.canonical_player_id = p_player_pool_id
      and (
        (
          p_league = 'premier'
          and p_season = settings.current_season
          and p.draft_id = settings.featured_draft_id
        )
        or (
          p_league = 'academy'
          and p_season = settings.academy_season
          and p.draft_id = settings.academy_draft_id
        )
      )
  )
$$;

revoke all on function public.is_player_rostered_on_team(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.is_player_rostered_on_team(uuid, uuid, text, text)
  to authenticated, service_role;

-- Caller-scoped helper used by the private match_codes RLS policy.
create or replace function public.is_approved_team_member(
  p_league_team_id uuid,
  p_season text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.player_identity_links pil
    where pil.profile_id = (select auth.uid())
      and pil.league_team_id = p_league_team_id
      and pil.season = p_season
      and pil.status = 'approved'
  )
$$;

revoke all on function public.is_approved_team_member(uuid, text)
  from public, anon;
grant execute on function public.is_approved_team_member(uuid, text)
  to authenticated, service_role;

-- Public-safe claim state. This is deliberately SECURITY DEFINER because the
-- underlying table has no anonymous grant; the only possible return values
-- contain no profile or team information.
create or replace function public.player_identity_state(
  p_player_pool_id uuid,
  p_league text,
  p_season text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case pil.status
      when 'approved' then 'claimed'
      when 'pending' then 'pending'
    end
    from public.player_identity_links pil
    where pil.player_pool_id = p_player_pool_id
      and pil.league = p_league
      and pil.season = p_season
  ), 'unclaimed')
$$;

revoke all on function public.player_identity_state(uuid, text, text)
  from public;
grant execute on function public.player_identity_state(uuid, text, text)
  to anon, authenticated, service_role;

alter table public.player_identity_links enable row level security;

drop policy if exists player_identity_links_select
  on public.player_identity_links;
create policy player_identity_links_select
  on public.player_identity_links
  for select
  to authenticated
  using (
    public.is_admin()
    or profile_id = (select auth.uid())
    or (
      league_team_id is not null
      and public.is_captain_of(league_team_id, season)
    )
  );

drop policy if exists player_identity_links_self_insert
  on public.player_identity_links;
create policy player_identity_links_self_insert
  on public.player_identity_links
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      profile_id = (select auth.uid())
      and requested_by = (select auth.uid())
      and status = 'pending'
      and source = 'team'
      and league_team_id is not null
      and public.is_player_rostered_on_team(
        player_pool_id, league_team_id, league, season
      )
    )
  );

drop policy if exists player_identity_links_delete
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
      league_team_id is not null
      and public.is_captain_of(league_team_id, season)
      and public.is_player_rostered_on_team(
        player_pool_id, league_team_id, league, season
      )
    )
  );

drop policy if exists player_identity_links_update
  on public.player_identity_links;
create policy player_identity_links_update
  on public.player_identity_links
  for update
  to authenticated
  using (
    public.is_admin()
    or (
      league_team_id is not null
      and public.is_captain_of(league_team_id, season)
      and public.is_player_rostered_on_team(
        player_pool_id, league_team_id, league, season
      )
    )
  )
  with check (
    public.is_admin()
    or (
      league_team_id is not null
      and public.is_captain_of(league_team_id, season)
      and public.is_player_rostered_on_team(
        player_pool_id, league_team_id, league, season
      )
    )
  );

-- RLS scopes the old and new rows to the captain's team, but PostgreSQL
-- policies cannot compare OLD with NEW. Keep captain updates to the one
-- intended transition: approve the existing request and stamp the real
-- caller. Admins retain unrestricted update access; service-role JWTs remain
-- trusted for server maintenance.
create or replace function public.enforce_player_identity_decision_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_admin()
     or coalesce((select auth.jwt()->>'role'), '') = 'service_role' then
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

revoke all on function public.enforce_player_identity_decision_update()
  from public, anon, authenticated;

drop trigger if exists player_identity_links_enforce_decision_update
  on public.player_identity_links;
create trigger player_identity_links_enforce_decision_update
  before update on public.player_identity_links
  for each row
  execute function public.enforce_player_identity_decision_update();

revoke all on table public.player_identity_links from anon;
grant select, insert, update, delete on table public.player_identity_links
  to authenticated;
grant all on table public.player_identity_links to service_role;

-- Approved members gain the same read-only fixture-code access as captains.
drop policy if exists match_codes_select on public.match_codes;
create policy match_codes_select
  on public.match_codes
  for select
  using (
    public.is_admin()
    or public.is_captain_of(team_a_id, season)
    or public.is_captain_of(team_b_id, season)
    or public.is_approved_team_member(team_a_id, season)
    or public.is_approved_team_member(team_b_id, season)
  );

-- Card claims may optionally name the canonical player they represent.
alter table public.card_claims
  add column if not exists player_pool_id uuid
  references public.player_pool(id) on delete set null;

create index if not exists card_claims_player_pool_id_idx
  on public.card_claims (player_pool_id)
  where player_pool_id is not null;

-- Compare a card Riot ID with curated canonical OP.GG metadata. Both direct
-- summoner URLs and multisearch URLs are accepted, but aliases and base-name
-- guesses are not: private team access requires an exact name + tag pair.
create or replace function public.card_claim_matches_opgg(
  p_summoner text,
  p_tag text,
  p_opgg_url text
) returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with encoded as (
    select
      lower(net._urlencode_string(trim(p_summoner)::varchar)) as game_name,
      lower(net._urlencode_string(trim(p_tag)::varchar)) as tag,
      lower(net._urlencode_string(
        (trim(p_summoner) || '#' || trim(p_tag))::varchar
      )) as account
  ), normalized as (
    select replace(lower(coalesce(p_opgg_url, '')), '+', '%20') as url
  )
  select exists (
    select 1
    from encoded e
    cross join normalized n
    where
      lower(regexp_replace(split_part(n.url, '?', 1), '^.*/', ''))
        = e.game_name || '-' || e.tag
      or e.account = any(string_to_array(
        replace(
          split_part(split_part(n.url, 'summoners=', 2), '&', 1),
          ',',
          '%2c'
        ),
        '%2c'
      ))
  )
$$;

revoke all on function public.card_claim_matches_opgg(text, text, text)
  from public, anon, authenticated, service_role;

-- Moderate the card and synchronize an exact compatible identity in one
-- transaction. Missing/ambiguous Riot roster membership intentionally leaves
-- this as a card-only approval. A supplied canonical player that contradicts
-- the one exact roster team, or conflicts with an existing identity, aborts
-- the whole function and therefore rolls the card approval back too.
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
