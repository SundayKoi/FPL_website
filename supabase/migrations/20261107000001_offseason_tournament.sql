-- The offseason tournament: an individual event between splits (see
-- docs/offseason.md). Players sign up as individuals, captains draft fresh
-- teams every week through the ordinary auction room, teams play a short
-- round robin, and from week 3 the lowest-rated players per role drop into
-- an elimination tier whose losing teams leave the event.
--
-- SELF-CONTAINED ON PURPOSE. Everything here is offseason_*: no existing
-- table, policy, trigger or function is altered. The weekly auctions are
-- ordinary rows in drafts/teams/players, created through
-- offseason_create_week_draft() because those tables are owner-write, and
-- they run in the existing draft room. Removing the event is a forward
-- migration that drops these objects (and deleting its drafts in the admin
-- draft list); docs/offseason.md has the checklist.
--
-- WHO MAY WRITE. Everything is public to read. Admins and owners write the
-- event's own tables directly (RLS) or through the RPCs below, which check
-- the caller themselves. Signing up is any signed-in profile, through
-- offseason_sign_up() only. offseason_stats is written by the service-role
-- ingest (scripts/offseason_ingest.py) and nothing else.

-- === Tables ==================================================================

create table public.offseason_events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  status text not null default 'signups' check (status in ('signups', 'running', 'finals', 'complete')),
  signups_open boolean not null default true,
  -- The rating baseline the card engine grades against (styleYardsticks.json).
  yardstick_season text not null default 'S6' check (char_length(yardstick_season) between 1 and 16),
  created_at timestamptz not null default now()
);

create table public.offseason_entrants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.offseason_events(id) on delete cascade,
  -- Null for a player staff added by hand; signing up with the same Riot ID
  -- claims the row. A captain needs one: the auction room seats captains by
  -- profile.
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 32),
  riot_id text not null check (riot_id ~ '^[^#]{3,16}#[^#]{2,5}$'),
  opgg_url text check (opgg_url is null or char_length(opgg_url) <= 300),
  current_rank text check (current_rank is null or char_length(current_rank) <= 32),
  primary_role public.lol_role not null,
  secondary_role public.lol_role check (secondary_role is distinct from primary_role),
  -- The role the event plays them in; null until staff apply the roles.
  assigned_role public.lol_role,
  status text not null default 'active' check (status in ('active', 'benched', 'eliminated', 'withdrawn')),
  eliminated_week int check (eliminated_week is null or eliminated_week between 1 and 30),
  signed_up_at timestamptz not null default now(),
  check ((status = 'eliminated') = (eliminated_week is not null))
);

create unique index offseason_entrants_profile_key
  on public.offseason_entrants (event_id, profile_id) where profile_id is not null;
create unique index offseason_entrants_riot_key
  on public.offseason_entrants (event_id, lower(riot_id));
create index offseason_entrants_event_idx on public.offseason_entrants (event_id, signed_up_at);

create table public.offseason_weeks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.offseason_events(id) on delete cascade,
  week_number int not null check (week_number between 1 and 30),
  status text not null default 'setup' check (status in ('setup', 'drafting', 'playing', 'complete')),
  -- How many players per role were pulled into the elimination tier.
  elimination_per_role int not null default 0 check (elimination_per_role between 0 and 6),
  main_draft_id uuid references public.drafts(id) on delete set null,
  elimination_draft_id uuid references public.drafts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, week_number)
);

-- Who is in which tier this week, and who captains. Written whole by
-- offseason_set_week_entries(), so a week's pools are never half-saved.
create table public.offseason_week_entries (
  week_id uuid not null references public.offseason_weeks(id) on delete cascade,
  entrant_id uuid not null references public.offseason_entrants(id) on delete cascade,
  tier text not null check (tier in ('main', 'elimination', 'bench')),
  captain_seat int check (captain_seat is null or captain_seat between 1 and 20),
  primary key (week_id, entrant_id),
  check (captain_seat is null or tier <> 'bench')
);

create unique index offseason_week_entries_seat_key
  on public.offseason_week_entries (week_id, tier, captain_seat) where captain_seat is not null;

-- Which entrant each auction player row is, so a finished draft can be
-- read back into the event. Written by offseason_create_week_draft() only.
create table public.offseason_draft_links (
  draft_player_id uuid primary key references public.players(id) on delete cascade,
  entrant_id uuid not null references public.offseason_entrants(id) on delete cascade
);

create table public.offseason_teams (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.offseason_weeks(id) on delete cascade,
  tier text not null check (tier in ('main', 'elimination')),
  name text not null check (char_length(btrim(name)) between 1 and 64),
  captain_entrant_id uuid references public.offseason_entrants(id) on delete set null,
  draft_team_id uuid references public.teams(id) on delete set null,
  eliminated boolean not null default false,
  check (not eliminated or tier = 'elimination')
);

create index offseason_teams_week_idx on public.offseason_teams (week_id, tier);

create table public.offseason_team_members (
  team_id uuid not null references public.offseason_teams(id) on delete cascade,
  entrant_id uuid not null references public.offseason_entrants(id) on delete cascade,
  role public.lol_role not null,
  price int check (price is null or price >= 0),
  primary key (team_id, entrant_id),
  unique (team_id, role)
);

create table public.offseason_matches (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.offseason_weeks(id) on delete cascade,
  stage text not null check (stage in ('round_robin', 'elimination', 'semifinal', 'final')),
  sort_order int not null default 0,
  team_a_id uuid not null references public.offseason_teams(id) on delete cascade,
  team_b_id uuid not null references public.offseason_teams(id) on delete cascade,
  best_of int not null default 1 check (best_of in (1, 3, 5)),
  winner_team_id uuid references public.offseason_teams(id) on delete set null,
  check (team_a_id <> team_b_id),
  check (winner_team_id is null or winner_team_id in (team_a_id, team_b_id))
);

create index offseason_matches_week_idx on public.offseason_matches (week_id, sort_order);

create table public.offseason_games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.offseason_matches(id) on delete cascade,
  game_number int not null check (game_number between 1 and 5),
  riot_match_id text check (riot_match_id is null or riot_match_id ~ '^[A-Z0-9]{2,6}_[0-9]{5,15}$'),
  winner_team_id uuid references public.offseason_teams(id) on delete set null,
  ingested_at timestamptz,
  ingest_error text,
  unique (match_id, game_number)
);

create unique index offseason_games_riot_key
  on public.offseason_games (riot_match_id) where riot_match_id is not null;

-- The event's per-player game rows, in raw_stats' own shape so the Python
-- ingest and the card engine read them unchanged. Kept apart from raw_stats
-- so nothing on the league's stats, cards or awards ever sees an offseason
-- game.
create table public.offseason_stats (like public.raw_stats including all);

-- === Grants and RLS ==========================================================

-- PostgREST sees only what is granted; RLS then decides rows. Everyone
-- reads the event. authenticated may write the staff-edited tables, which
-- the staff policies below narrow to admins and owners. Week entries, draft
-- links and games are written through the RPCs only, and offseason_stats by
-- the service-role ingest only.
grant select on public.offseason_events, public.offseason_entrants, public.offseason_weeks,
  public.offseason_week_entries, public.offseason_draft_links, public.offseason_teams,
  public.offseason_team_members, public.offseason_matches, public.offseason_games,
  public.offseason_stats
  to anon, authenticated;
grant insert, update, delete on public.offseason_events, public.offseason_entrants,
  public.offseason_weeks, public.offseason_teams, public.offseason_team_members,
  public.offseason_matches
  to authenticated;
grant all on public.offseason_events, public.offseason_entrants, public.offseason_weeks,
  public.offseason_week_entries, public.offseason_draft_links, public.offseason_teams,
  public.offseason_team_members, public.offseason_matches, public.offseason_games,
  public.offseason_stats
  to service_role;

alter table public.offseason_events        enable row level security;
alter table public.offseason_entrants      enable row level security;
alter table public.offseason_weeks         enable row level security;
alter table public.offseason_week_entries  enable row level security;
alter table public.offseason_draft_links   enable row level security;
alter table public.offseason_teams         enable row level security;
alter table public.offseason_team_members  enable row level security;
alter table public.offseason_matches       enable row level security;
alter table public.offseason_games         enable row level security;
alter table public.offseason_stats         enable row level security;

create function public.offseason_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_owner()
$$;

revoke all on function public.offseason_is_staff() from public;
grant execute on function public.offseason_is_staff() to anon, authenticated, service_role;

create policy offseason_events_public_read       on public.offseason_events       for select using (true);
create policy offseason_entrants_public_read     on public.offseason_entrants     for select using (true);
create policy offseason_weeks_public_read        on public.offseason_weeks        for select using (true);
create policy offseason_week_entries_public_read on public.offseason_week_entries for select using (true);
create policy offseason_draft_links_public_read  on public.offseason_draft_links  for select using (true);
create policy offseason_teams_public_read        on public.offseason_teams        for select using (true);
create policy offseason_team_members_public_read on public.offseason_team_members for select using (true);
create policy offseason_matches_public_read      on public.offseason_matches      for select using (true);
create policy offseason_games_public_read        on public.offseason_games        for select using (true);
create policy offseason_stats_public_read        on public.offseason_stats        for select using (true);

-- Staff edit the event's own tables directly for settings and fix-ups;
-- multi-table transitions go through the RPCs below.
create policy offseason_events_staff_write on public.offseason_events
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());
create policy offseason_entrants_staff_write on public.offseason_entrants
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());
create policy offseason_weeks_staff_write on public.offseason_weeks
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());
create policy offseason_teams_staff_write on public.offseason_teams
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());
create policy offseason_team_members_staff_write on public.offseason_team_members
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());
create policy offseason_matches_staff_write on public.offseason_matches
  for all using (public.offseason_is_staff()) with check (public.offseason_is_staff());

-- === Helpers =================================================================

create function public._offseason_require_staff() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.offseason_is_staff() then
    raise exception 'NOT_ADMIN: offseason staff access required';
  end if;
end $$;

revoke all on function public._offseason_require_staff() from public, anon, authenticated;

-- A match is won once one side takes a majority of its best-of.
create function public._offseason_refresh_match_winner(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.offseason_matches;
  v_need int;
  v_winner uuid;
begin
  select * into v_match from public.offseason_matches where id = p_match_id for update;
  if not found then return; end if;
  v_need := v_match.best_of / 2 + 1;
  select g.winner_team_id into v_winner
  from public.offseason_games g
  where g.match_id = p_match_id and g.winner_team_id is not null
  group by g.winner_team_id
  having count(*) >= v_need
  limit 1;
  update public.offseason_matches set winner_team_id = v_winner where id = p_match_id;
end $$;

revoke all on function public._offseason_refresh_match_winner(uuid) from public, anon, authenticated;

-- === Sign-up =================================================================

-- A signed-in player joins (or edits their entry) while sign-ups are open.
-- A staff-added row with the same Riot ID and no profile is claimed rather
-- than duplicated, and keeps its original sign-up time: first come, first
-- served is decided by when a player entered, not when they linked.
create function public.offseason_sign_up(
  p_event_id uuid,
  p_display_name text,
  p_riot_id text,
  p_opgg_url text,
  p_current_rank text,
  p_primary_role public.lol_role,
  p_secondary_role public.lol_role
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_event public.offseason_events;
  v_riot text := btrim(coalesce(p_riot_id, ''));
  v_name text := btrim(coalesce(p_display_name, ''));
  v_opgg text := nullif(btrim(coalesce(p_opgg_url, '')), '');
  v_rank text := nullif(btrim(coalesce(p_current_rank, '')), '');
  v_own public.offseason_entrants;
  v_claim public.offseason_entrants;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to sign up';
  end if;
  select * into v_event from public.offseason_events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND: no such event';
  end if;
  if not v_event.signups_open then
    raise exception 'SIGNUPS_CLOSED: sign-ups are closed';
  end if;
  if v_riot !~ '^[^#]{3,16}#[^#]{2,5}$' then
    raise exception 'RIOT_ID_INVALID: enter your Riot ID as Name#TAG';
  end if;
  if p_primary_role is null then
    raise exception 'ROLE_REQUIRED: choose a primary role';
  end if;
  if p_secondary_role is not distinct from p_primary_role then
    raise exception 'ROLE_INVALID: the secondary role must differ from the primary';
  end if;
  if v_name = '' then
    select display_name into v_name from public.profiles where id = v_uid;
    v_name := left(btrim(coalesce(v_name, split_part(v_riot, '#', 1))), 32);
  end if;
  if char_length(v_name) > 32 then
    raise exception 'NAME_INVALID: display name is at most 32 characters';
  end if;

  select * into v_own from public.offseason_entrants
    where event_id = p_event_id and profile_id = v_uid for update;
  if found then
    if exists (
      select 1 from public.offseason_entrants
      where event_id = p_event_id and lower(riot_id) = lower(v_riot) and id <> v_own.id
    ) then
      raise exception 'RIOT_ID_TAKEN: that Riot ID is already signed up';
    end if;
    update public.offseason_entrants
      set display_name = v_name, riot_id = v_riot, opgg_url = v_opgg, current_rank = v_rank,
          primary_role = p_primary_role, secondary_role = p_secondary_role,
          status = case when status = 'withdrawn' then 'active' else status end
      where id = v_own.id;
    return v_own.id;
  end if;

  select * into v_claim from public.offseason_entrants
    where event_id = p_event_id and lower(riot_id) = lower(v_riot) for update;
  if found then
    if v_claim.profile_id is not null then
      raise exception 'RIOT_ID_TAKEN: that Riot ID is already signed up';
    end if;
    update public.offseason_entrants
      set profile_id = v_uid, display_name = v_name, riot_id = v_riot, opgg_url = v_opgg,
          current_rank = v_rank, primary_role = p_primary_role, secondary_role = p_secondary_role
      where id = v_claim.id;
    return v_claim.id;
  end if;

  insert into public.offseason_entrants
    (event_id, profile_id, display_name, riot_id, opgg_url, current_rank, primary_role, secondary_role)
  values (p_event_id, v_uid, v_name, v_riot, v_opgg, v_rank, p_primary_role, p_secondary_role)
  returning id into v_own.id;
  return v_own.id;
end $$;

-- A player takes themselves out while sign-ups are open.
create function public.offseason_withdraw(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in first';
  end if;
  if not exists (select 1 from public.offseason_events where id = p_event_id and signups_open) then
    raise exception 'SIGNUPS_CLOSED: ask staff to withdraw you';
  end if;
  update public.offseason_entrants set status = 'withdrawn'
    where event_id = p_event_id and profile_id = v_uid and status in ('active', 'benched');
end $$;

-- === Staff: roles and weekly pools ===========================================

-- Applies a whole role assignment at once: each entry names an entrant, the
-- role they play, and whether they play this event (active) or sit out
-- (benched). Eliminated and withdrawn players cannot be reassigned here.
create function public.offseason_apply_roles(p_event_id uuid, p_assignments jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_entrant public.offseason_entrants;
  v_role public.lol_role;
  v_status text;
  v_count int := 0;
begin
  perform public._offseason_require_staff();
  if jsonb_typeof(p_assignments) is distinct from 'array' then
    raise exception 'ASSIGNMENTS_INVALID: expected a list';
  end if;
  for v_item in select * from jsonb_array_elements(p_assignments) loop
    select * into v_entrant from public.offseason_entrants
      where id = (v_item ->> 'entrant_id')::uuid and event_id = p_event_id
      for update;
    if not found then
      raise exception 'ENTRANT_INVALID: % is not in this event', v_item ->> 'entrant_id';
    end if;
    if v_entrant.status in ('eliminated', 'withdrawn') then
      raise exception 'ENTRANT_INVALID: % is %', v_entrant.display_name, v_entrant.status;
    end if;
    v_status := coalesce(v_item ->> 'status', 'active');
    if v_status not in ('active', 'benched') then
      raise exception 'ASSIGNMENTS_INVALID: status must be active or benched';
    end if;
    v_role := nullif(v_item ->> 'role', '')::public.lol_role;
    if v_status = 'active' and v_role is null then
      raise exception 'ASSIGNMENTS_INVALID: % needs a role to play', v_entrant.display_name;
    end if;
    update public.offseason_entrants
      set assigned_role = v_role, status = v_status
      where id = v_entrant.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Replaces a week's tiers and captains in one go. Only while the week is
-- still in setup: once a draft exists its pool is fixed.
create function public.offseason_set_week_entries(p_week_id uuid, p_entries jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_item jsonb;
  v_entrant public.offseason_entrants;
  v_tier text;
  v_seat int;
  v_count int := 0;
begin
  perform public._offseason_require_staff();
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  if v_week.status <> 'setup' or v_week.main_draft_id is not null or v_week.elimination_draft_id is not null then
    raise exception 'WEEK_LOCKED: week % already has a draft', v_week.week_number;
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'ENTRIES_INVALID: expected a list';
  end if;

  delete from public.offseason_week_entries where week_id = p_week_id;

  for v_item in select * from jsonb_array_elements(p_entries) loop
    select * into v_entrant from public.offseason_entrants
      where id = (v_item ->> 'entrant_id')::uuid and event_id = v_week.event_id;
    if not found then
      raise exception 'ENTRANT_INVALID: % is not in this event', v_item ->> 'entrant_id';
    end if;
    v_tier := v_item ->> 'tier';
    if v_tier not in ('main', 'elimination', 'bench') then
      raise exception 'ENTRIES_INVALID: tier must be main, elimination or bench';
    end if;
    if v_tier <> 'bench' and (v_entrant.status <> 'active' or v_entrant.assigned_role is null) then
      raise exception 'ENTRANT_INVALID: % is not an active player with a role', v_entrant.display_name;
    end if;
    v_seat := nullif(v_item ->> 'captain_seat', '')::int;
    insert into public.offseason_week_entries (week_id, entrant_id, tier, captain_seat)
      values (p_week_id, v_entrant.id, v_tier, v_seat);
    v_count := v_count + 1;
  end loop;

  update public.offseason_weeks set elimination_per_role = coalesce(
    (select count(*) from public.offseason_week_entries we
       join public.offseason_entrants e on e.id = we.entrant_id
      where we.week_id = p_week_id and we.tier = 'elimination'
      group by e.assigned_role order by count(*) desc limit 1), 0)
  where id = p_week_id;
  return v_count;
end $$;

-- === Staff: the weekly auction ===============================================

-- Builds the week's auction for one tier in the ordinary draft tables: a
-- team per captain (seated on it, as the league's captains are), the
-- tier's other players as the pool, and the given budget and bid rules.
-- The room at /draft/<id> and the admin draft console run it unchanged.
create function public.offseason_create_week_draft(
  p_week_id uuid,
  p_tier text,
  p_budget int,
  p_countdown_seconds int default 15,
  p_round_minimums int[] default '{10,5,1}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_event public.offseason_events;
  v_draft uuid;
  v_team uuid;
  v_player uuid;
  v_captain record;
  v_pool record;
  v_seat int := 0;
  v_abbr text;
  r public.lol_role;
  v_need int;
  v_have int;
begin
  perform public._offseason_require_staff();
  if p_tier not in ('main', 'elimination') then
    raise exception 'TIER_INVALID: tier must be main or elimination';
  end if;
  if p_budget is null or p_budget < 1 then
    raise exception 'BUDGET_INVALID: set a budget of at least 1';
  end if;
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  if v_week.status = 'complete' then
    raise exception 'WEEK_LOCKED: week % is complete', v_week.week_number;
  end if;
  if (p_tier = 'main' and v_week.main_draft_id is not null)
     or (p_tier = 'elimination' and v_week.elimination_draft_id is not null) then
    raise exception 'DRAFT_EXISTS: week % already has a % draft', v_week.week_number, p_tier;
  end if;
  select * into v_event from public.offseason_events where id = v_week.event_id;

  if (select count(*) from public.offseason_week_entries
       where week_id = p_week_id and tier = p_tier and captain_seat is not null) < 2 then
    raise exception 'CAPTAINS_REQUIRED: pick at least two % captains', p_tier;
  end if;
  if exists (
    select 1 from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is not null
      and e.profile_id is null
  ) then
    raise exception 'CAPTAIN_NOT_LINKED: every captain must have signed up on the site';
  end if;

  insert into public.drafts (name, countdown_seconds, round_minimums)
  values (
    'Offseason W' || v_week.week_number || case when p_tier = 'elimination' then ' Elimination' else '' end,
    coalesce(p_countdown_seconds, 15),
    coalesce(p_round_minimums, '{10,5,1}')
  )
  returning id into v_draft;

  for v_captain in
    select e.* from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is not null
    order by we.captain_seat
  loop
    v_seat := v_seat + 1;
    v_abbr := left(upper(regexp_replace(v_captain.display_name, '[^A-Za-z0-9]', '', 'g')), 4);
    if v_abbr = '' then v_abbr := 'T' || v_seat; end if;
    insert into public.teams (draft_id, name, abbreviation, captain_profile_id, nomination_position,
                              budget_start, points_remaining)
    values (v_draft, left('Team ' || v_captain.display_name, 64), v_abbr, v_captain.profile_id, v_seat,
            p_budget, p_budget)
    returning id into v_team;
    insert into public.players (draft_id, display_name, role, rank, opgg_url, team_id, price, acquisition)
    values (v_draft, v_captain.display_name, v_captain.assigned_role, v_captain.current_rank,
            v_captain.opgg_url, v_team, 0, 'captain')
    returning id into v_player;
    insert into public.offseason_draft_links (draft_player_id, entrant_id) values (v_player, v_captain.id);
  end loop;

  for v_pool in
    select e.* from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is null
    order by e.signed_up_at
  loop
    insert into public.players (draft_id, display_name, role, rank, opgg_url)
    values (v_draft, v_pool.display_name, v_pool.assigned_role, v_pool.current_rank, v_pool.opgg_url)
    returning id into v_player;
    insert into public.offseason_draft_links (draft_player_id, entrant_id) values (v_player, v_pool.id);
  end loop;

  -- The same coverage start_draft() will demand, said up front: every team
  -- needs one player in each role its captain does not play.
  foreach r in array enum_range(null::public.lol_role) loop
    select count(*) into v_need from public.teams t
      where t.draft_id = v_draft and r = any(public.open_roles(t.id));
    select count(*) into v_have from public.players p
      where p.draft_id = v_draft and p.role = r and p.team_id is null;
    if v_have < v_need then
      raise exception 'POOL_SHORT: % teams need a %, the % pool has %', v_need, r, p_tier, v_have;
    end if;
  end loop;

  if p_tier = 'main' then
    update public.offseason_weeks set main_draft_id = v_draft, status = 'drafting' where id = p_week_id;
  else
    update public.offseason_weeks set elimination_draft_id = v_draft, status = 'drafting' where id = p_week_id;
  end if;
  return v_draft;
end $$;

-- Reads a finished auction back into the event: one offseason team per
-- draft team, with the players it bought (and its captain) as members.
create function public.offseason_import_week_draft(p_week_id uuid, p_tier text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_draft uuid;
  v_team record;
  v_new uuid;
  v_count int := 0;
begin
  perform public._offseason_require_staff();
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  v_draft := case p_tier when 'main' then v_week.main_draft_id when 'elimination' then v_week.elimination_draft_id end;
  if v_draft is null then
    raise exception 'DRAFT_MISSING: week % has no % draft', v_week.week_number, coalesce(p_tier, '?');
  end if;
  if exists (select 1 from public.offseason_teams where week_id = p_week_id and tier = p_tier) then
    raise exception 'ALREADY_IMPORTED: the % teams for week % are already in', p_tier, v_week.week_number;
  end if;
  if exists (
    select 1 from public.teams t
    where t.draft_id = v_draft and cardinality(public.open_roles(t.id)) > 0
  ) then
    raise exception 'DRAFT_NOT_FINISHED: every team needs all five roles first';
  end if;

  for v_team in
    select t.* from public.teams t where t.draft_id = v_draft order by t.nomination_position
  loop
    insert into public.offseason_teams (week_id, tier, name, captain_entrant_id, draft_team_id)
    values (
      p_week_id, p_tier, v_team.name,
      (select l.entrant_id from public.players p
         join public.offseason_draft_links l on l.draft_player_id = p.id
        where p.team_id = v_team.id and p.acquisition = 'captain' limit 1),
      v_team.id
    )
    returning id into v_new;
    insert into public.offseason_team_members (team_id, entrant_id, role, price)
    select v_new, l.entrant_id, p.role, p.price
    from public.players p
    join public.offseason_draft_links l on l.draft_player_id = p.id
    where p.team_id = v_team.id;
    v_count := v_count + 1;
  end loop;

  if p_tier = 'main' then
    update public.offseason_weeks set status = 'playing' where id = p_week_id;
  end if;
  return v_count;
end $$;

-- === Staff: results ==========================================================

-- Records (or clears) one game of a match: its Riot match id, for the stats
-- ingest, and its winner. Clearing both removes the game. The match winner
-- follows from the games.
create function public.offseason_set_game(
  p_match_id uuid,
  p_game_number int,
  p_riot_match_id text,
  p_winner_team_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_match public.offseason_matches;
  v_riot text := nullif(upper(btrim(coalesce(p_riot_match_id, ''))), '');
begin
  perform public._offseason_require_staff();
  select * into v_match from public.offseason_matches where id = p_match_id;
  if not found then
    raise exception 'MATCH_NOT_FOUND: no such match';
  end if;
  if p_game_number is null or p_game_number < 1 or p_game_number > v_match.best_of then
    raise exception 'GAME_INVALID: game % is outside a best of %', p_game_number, v_match.best_of;
  end if;
  if p_winner_team_id is not null and p_winner_team_id not in (v_match.team_a_id, v_match.team_b_id) then
    raise exception 'WINNER_INVALID: the winner must be one of the two teams';
  end if;
  if v_riot is not null and v_riot !~ '^[A-Z0-9]{2,6}_[0-9]{5,15}$' then
    raise exception 'RIOT_MATCH_INVALID: expected a match id like NA1_1234567890';
  end if;
  if v_riot is not null and exists (
    select 1 from public.offseason_games
    where riot_match_id = v_riot and not (match_id = p_match_id and game_number = p_game_number)
  ) then
    raise exception 'RIOT_MATCH_TAKEN: that match id is already recorded for another game';
  end if;

  if v_riot is null and p_winner_team_id is null then
    delete from public.offseason_games where match_id = p_match_id and game_number = p_game_number;
  else
    insert into public.offseason_games (match_id, game_number, riot_match_id, winner_team_id)
    values (p_match_id, p_game_number, v_riot, p_winner_team_id)
    on conflict (match_id, game_number) do update
      set riot_match_id = excluded.riot_match_id,
          winner_team_id = excluded.winner_team_id,
          ingested_at = case when public.offseason_games.riot_match_id is distinct from excluded.riot_match_id
                             then null else public.offseason_games.ingested_at end,
          ingest_error = case when public.offseason_games.riot_match_id is distinct from excluded.riot_match_id
                              then null else public.offseason_games.ingest_error end;
  end if;
  perform public._offseason_refresh_match_winner(p_match_id);
end $$;

-- The stats ingest reports back on one game: when it landed (or why not),
-- and the winner its rows show when staff had not entered one.
create function public.offseason_record_ingest(
  p_game_id uuid,
  p_error text,
  p_winner_team_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game public.offseason_games;
begin
  select * into v_game from public.offseason_games where id = p_game_id for update;
  if not found then
    raise exception 'GAME_NOT_FOUND: no such game';
  end if;
  if p_error is not null then
    update public.offseason_games set ingest_error = left(p_error, 500) where id = p_game_id;
    return;
  end if;
  update public.offseason_games
    set ingested_at = now(),
        ingest_error = null,
        winner_team_id = coalesce(winner_team_id, (
          select p_winner_team_id from public.offseason_matches m
          where m.id = v_game.match_id and p_winner_team_id in (m.team_a_id, m.team_b_id)))
    where id = p_game_id;
  perform public._offseason_refresh_match_winner(v_game.match_id);
end $$;

-- === Staff: elimination ======================================================

-- Marks an elimination-tier team out (or restores it): its players leave
-- the event as of this week and cannot be drafted again.
create function public.offseason_set_team_eliminated(p_team_id uuid, p_eliminated boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team public.offseason_teams;
  v_week public.offseason_weeks;
begin
  perform public._offseason_require_staff();
  select * into v_team from public.offseason_teams where id = p_team_id for update;
  if not found then
    raise exception 'TEAM_NOT_FOUND: no such team';
  end if;
  if v_team.tier <> 'elimination' then
    raise exception 'TEAM_INVALID: only elimination-tier teams can be eliminated';
  end if;
  select * into v_week from public.offseason_weeks where id = v_team.week_id;

  update public.offseason_teams set eliminated = coalesce(p_eliminated, false) where id = p_team_id;
  if coalesce(p_eliminated, false) then
    update public.offseason_entrants e
      set status = 'eliminated', eliminated_week = v_week.week_number
      from public.offseason_team_members m
      where m.team_id = p_team_id and m.entrant_id = e.id;
  else
    update public.offseason_entrants e
      set status = 'active', eliminated_week = null
      from public.offseason_team_members m
      where m.team_id = p_team_id and m.entrant_id = e.id
        and e.eliminated_week = v_week.week_number;
  end if;
end $$;

-- === Grants ==================================================================

revoke all on function public.offseason_sign_up(uuid, text, text, text, text, public.lol_role, public.lol_role) from public;
revoke all on function public.offseason_withdraw(uuid) from public;
revoke all on function public.offseason_apply_roles(uuid, jsonb) from public;
revoke all on function public.offseason_set_week_entries(uuid, jsonb) from public;
revoke all on function public.offseason_create_week_draft(uuid, text, int, int, int[]) from public;
revoke all on function public.offseason_import_week_draft(uuid, text) from public;
revoke all on function public.offseason_set_game(uuid, int, text, uuid) from public;
revoke all on function public.offseason_record_ingest(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.offseason_set_team_eliminated(uuid, boolean) from public;

grant execute on function public.offseason_sign_up(uuid, text, text, text, text, public.lol_role, public.lol_role) to authenticated;
grant execute on function public.offseason_withdraw(uuid) to authenticated;
grant execute on function public.offseason_apply_roles(uuid, jsonb) to authenticated;
grant execute on function public.offseason_set_week_entries(uuid, jsonb) to authenticated;
grant execute on function public.offseason_create_week_draft(uuid, text, int, int, int[]) to authenticated;
grant execute on function public.offseason_import_week_draft(uuid, text) to authenticated;
grant execute on function public.offseason_set_game(uuid, int, text, uuid) to authenticated;
grant execute on function public.offseason_record_ingest(uuid, text, uuid) to service_role;
grant execute on function public.offseason_set_team_eliminated(uuid, boolean) to authenticated;
