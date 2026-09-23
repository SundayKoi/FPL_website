-- The atlas: a codex of every place a collector's squads have walked, the
-- league's landmarks named after the first collector to reach them, and a
-- reward for walking a route's whole road in a season.
-- Spec: docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md §5.
--
-- The codex itself is derived, not stored: src/lib/expeditions/atlas.ts
-- walks a collector's claimed runs. What a run walked is written into its
-- outcome at the claim (outcome.atlas = { places, encounters, ghosts }) —
-- resolve_expedition stores the whole document, so that needs no change
-- here. The database keeps only what is genuinely state:
--
--   1. expedition_landmarks — one row per (season, place): who reached the
--      place first. League news, readable by everyone, like the league
--      goal's tables. Written only by name_expedition_landmarks.
--
--   2. expedition_atlas_awards — one row per (collector, season, route):
--      the road was walked end to end and paid for. Owner read, like
--      expedition_supplies. Written only by award_expedition_road.
--
--   3. expedition_road_size / expedition_road_reward — how many places a
--      route's road holds (ROAD_SIZES in forks.ts, every place in every
--      slot of routes.ts's ROADS) and what walking all of them pays
--      (ROAD_REWARDS in atlas.ts). atlas.test.ts reads both bodies below
--      and holds them equal to the app's tables.
--
--   4. name_expedition_landmarks(p_user, p_run, p_places) — the claim
--      names the places its run walked. Only places the run's own stamped
--      atlas lists ('places not walked' otherwise), only once the run is
--      claimed, and first claim wins: every insert is `on conflict do
--      nothing`, and the function returns only the rows THIS call created,
--      which is what the app announces.
--
--   5. award_expedition_road(p_user, p_season, p_tier) — counts the
--      distinct stamped places over the collector's claimed runs of that
--      route in that season; below the road's size it refuses ('road not
--      complete'). The award row's primary key is the lock, exactly like
--      fell_expedition_league_goal: a second call (or a racing claim)
--      answers (false, 0) and pays nobody twice. Only a call that inserts
--      credits the fragments, and for the Legendary route the free pack
--      (the card_pack_comps upsert resolve_expedition uses).
--
-- Both RPCs are service role only: the app's claim establishes who is
-- calling and passes the Discord id, as for every expedition RPC. Both are
-- best effort in the app — a paid claim never fails because a landmark or
-- an award could not be written.
--
-- League isolation: Premier and Academy keep separate season labels, and
-- every run is stamped with one. A landmark takes its season from the run
-- that reached it, never from the caller, so a place is named once per
-- league; a road award is keyed by season and counts only that season's
-- runs, so walking half a road in each league completes neither. The
-- fragments land in the one season-blind pouch the collector already has
-- (expedition_supplies), as for the league goal's reward.
--
-- Road completion counts only runs whose outcome carries a stamped atlas:
-- runs claimed after the app that stamps it ships, or older runs the owner
-- chooses to stamp with scripts/backfill-expedition-atlas.ts. The codex on
-- the page also shows places from older runs (derived), but only a stamp
-- counts toward a reward.
--
-- Deploy safety: the app reads both tables through fail-soft queries (a
-- missing table hides the landmarks and the awards) and the claim calls
-- both RPCs best effort, logging an error and carrying on, so the code can
-- ship ahead of this migration. It depends on no data. Applied after the
-- code, the claims made in between carry their stamp already and count.

-- === 1. landmarks ============================================================

create table if not exists public.expedition_landmarks (
  season     text not null,
  -- A place key from routes.ts's ROADS. Keys are unique across routes, so
  -- the season and the key name one checkpoint in one league.
  place      text not null,
  discord_id text not null references public.betting_profiles(discord_id),
  run_id     bigint not null references public.expedition_runs(id),
  reached_at timestamptz not null default now(),
  primary key (season, place)
);

create index if not exists expedition_landmarks_discord_id_idx on public.expedition_landmarks (discord_id);
create index if not exists expedition_landmarks_run_id_idx on public.expedition_landmarks (run_id);

alter table public.expedition_landmarks enable row level security;

drop policy if exists expedition_landmarks_public_read on public.expedition_landmarks;
create policy expedition_landmarks_public_read on public.expedition_landmarks
  for select using (true);

grant select on public.expedition_landmarks to anon, authenticated;
grant all on public.expedition_landmarks to service_role;

-- === 2. road awards ==========================================================

create table if not exists public.expedition_atlas_awards (
  discord_id text not null references public.betting_profiles(discord_id),
  season     text not null,
  tier       text not null,
  fragments  int  not null check (fragments >= 0),
  comp       boolean not null default false,
  awarded_at timestamptz not null default now(),
  primary key (discord_id, season, tier)
);

alter table public.expedition_atlas_awards enable row level security;

drop policy if exists expedition_atlas_awards_owner_read on public.expedition_atlas_awards;
create policy expedition_atlas_awards_owner_read on public.expedition_atlas_awards
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_atlas_awards to authenticated;
grant all on public.expedition_atlas_awards to service_role;

-- === 3. the sizes and the rewards ============================================

-- ROAD_SIZES in src/lib/expeditions/forks.ts. Null for anything that is not
-- a route (a lost card's hold, a typo).
create or replace function public.expedition_road_size(p_tier text)
returns int
language sql
immutable
set search_path = public
as $$
  select case p_tier
    when 'scout'     then 4
    when 'gilded'    then 6
    when 'raid'      then 6
    when 'legend'    then 9
    when 'rescue'    then 3
    when 'exorcism'  then 0
    when 'legendary' then 12
    when 'mythic'    then 10
  end
$$;

-- ROAD_REWARDS in src/lib/expeditions/atlas.ts: map fragments, and a free
-- pack for the Legendary route. No row for anything that is not a route.
create or replace function public.expedition_road_reward(p_tier text)
returns table(fragments int, comp boolean)
language sql
immutable
set search_path = public
as $$
  select r.fragments, r.comp
  from (values
    ('scout',     1, false),
    ('gilded',    1, false),
    ('raid',      1, false),
    ('legend',    2, false),
    ('rescue',    1, false),
    ('exorcism',  0, false),
    ('legendary', 2, true),
    ('mythic',    3, false)
  ) as r(tier, fragments, comp)
  where r.tier = p_tier
$$;

revoke all on function public.expedition_road_size(text) from public, anon, authenticated;
revoke all on function public.expedition_road_reward(text) from public, anon, authenticated;
grant execute on function public.expedition_road_size(text) to service_role;
grant execute on function public.expedition_road_reward(text) to service_role;

-- === 4. naming the places a run reached ======================================

create or replace function public.name_expedition_landmarks(p_user text, p_run bigint, p_places text[])
returns setof public.expedition_landmarks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run    expedition_runs%rowtype;
  v_walked jsonb;
begin
  if p_user is null or p_run is null then raise exception 'unknown run'; end if;

  select * into v_run from expedition_runs r where r.id = p_run and r.discord_id = p_user;
  if not found or v_run.tier = 'lost' then raise exception 'unknown run'; end if;
  if v_run.claimed_at is null then raise exception 'run not claimed'; end if;

  if p_places is null or coalesce(array_length(p_places, 1), 0) = 0 then return; end if;

  -- The run's own record of where it went, written at its claim. A run
  -- without one names nothing: the caller cannot vouch for a road the
  -- outcome does not show.
  v_walked := v_run.outcome -> 'atlas' -> 'places';
  if v_walked is null or jsonb_typeof(v_walked) <> 'array' then raise exception 'places not walked'; end if;
  if exists (select 1 from unnest(p_places) as p(place) where p.place is null or not (v_walked ? p.place)) then
    raise exception 'places not walked';
  end if;

  -- First claim wins: a place already named in this season stays its
  -- namer's, and only the rows this call created come back.
  return query
    with named as (
      insert into expedition_landmarks (season, place, discord_id, run_id, reached_at)
      select distinct v_run.season, p.place, p_user, v_run.id, v_run.claimed_at
      from unnest(p_places) as p(place)
      on conflict on constraint expedition_landmarks_pkey do nothing
      returning *
    )
    select * from named;
end;
$$;

revoke all on function public.name_expedition_landmarks(text, bigint, text[]) from public, anon, authenticated;
grant execute on function public.name_expedition_landmarks(text, bigint, text[]) to service_role;

-- === 5. the road walked end to end ===========================================

create or replace function public.award_expedition_road(p_user text, p_season text, p_tier text)
returns table(awarded boolean, fragments int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_size     int;
  v_walked   int;
  v_frags    int;
  v_comp     boolean;
  v_inserted int;
begin
  if p_user is null or p_user = '' then raise exception 'unknown user'; end if;
  if p_season is null or p_season = '' then raise exception 'unknown season'; end if;
  v_size := expedition_road_size(p_tier);
  if v_size is null then raise exception 'unknown tier'; end if;
  -- A rite (the Exorcism) has no checkpoints: there is no road to walk.
  if v_size = 0 then raise exception 'no road'; end if;

  -- Every distinct place this collector's claimed runs of this route
  -- stamped, in this season only. Defensive about the json: a run from
  -- before the atlas has no stamp and counts nothing.
  select count(distinct w.place)::int into v_walked
  from expedition_runs r
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(r.outcome -> 'atlas' -> 'places') = 'array'
      then r.outcome -> 'atlas' -> 'places'
      else '[]'::jsonb
    end
  ) as w(place)
  where r.discord_id = p_user
    and r.season = p_season
    and r.tier = p_tier
    and r.claimed_at is not null;

  if coalesce(v_walked, 0) < v_size then raise exception 'road not complete'; end if;

  -- Qualified: fragments is also this function's output column.
  select rr.fragments, rr.comp into v_frags, v_comp from expedition_road_reward(p_tier) rr;

  insert into expedition_atlas_awards (discord_id, season, tier, fragments, comp)
  values (p_user, p_season, p_tier, coalesce(v_frags, 0), coalesce(v_comp, false))
  on conflict on constraint expedition_atlas_awards_pkey do nothing;
  get diagnostics v_inserted = row_count;

  -- Awarded already, by an earlier claim or a racing one (the insert waited
  -- for it to commit): nothing more to pay.
  if v_inserted = 0 then
    return query select false, 0;
    return;
  end if;

  if coalesce(v_frags, 0) > 0 then
    insert into expedition_supplies (discord_id, fragments) values (p_user, v_frags)
    on conflict on constraint expedition_supplies_pkey
    do update set fragments = expedition_supplies.fragments + excluded.fragments, updated_at = now();
  end if;

  if coalesce(v_comp, false) then
    insert into card_pack_comps (discord_id, kind, remaining, granted, reason)
    values (p_user, 'standard', 1, 1, 'expedition road ' || p_tier || ' ' || p_season)
    on conflict on constraint card_pack_comps_pkey
    do update set remaining = card_pack_comps.remaining + 1,
                  granted   = card_pack_comps.granted + 1;
  end if;

  return query select true, coalesce(v_frags, 0);
end;
$$;

revoke all on function public.award_expedition_road(text, text, text) from public, anon, authenticated;
grant execute on function public.award_expedition_road(text, text, text) to service_role;
