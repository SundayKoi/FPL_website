-- Expedition campaigns: three runs that tell one story.
--
-- A collector opts into a campaign from the board — The Broken Map
-- (Scouting Run → Deep Raid → Legend Hunt) or The Lost Print (Deep Raid →
-- Legend Hunt → Legendary route) — and walks its three stages in order.
-- Each run's grade and choices set the NEXT run's road: the places at
-- its checkpoints are no longer drawn from the run's seed but handed
-- down by the campaign (src/lib/expeditions/campaigns.ts decides which;
-- forksFor in routes.ts walks them). Finish all three and the finale
-- mints a campaign relic — a one-off copy of a survivor printed with the
-- campaign's own frame, priced flat like a moment and never boarding a
-- route that can lose it.
--
-- The database owns the state machine:
--
--   expedition_campaigns      one row per campaign; one OPEN per
--                             (collector, season)
--   expedition_runs.campaign  the campaign a run walks for
--   expedition_runs.road      the places the campaign handed that run,
--                             snapshotted at bind so the campaign's next
--                             road can change under it
--
--   start_expedition_campaign   opens one (refused while one is open)
--   bind_expedition_campaign    ties a fresh, unclaimed run to the
--                               campaign's current stage — the tier must
--                               be the stage's — and copies the road in
--   advance_expedition_campaign after the claim: stage + 1, the next
--                               road, the stage's log; at stage 3 the
--                               campaign finishes and the relic is minted
--                               off a survivor of the finale
--   abandon_expedition_campaign closes one unfinished
--
-- All four are service-role only: the app checks the caller and hands
-- in the road it computed; the RPCs check ownership, the stage, the tier
-- and the claim, so no client can skip a stage or mint twice.

alter table public.expedition_runs
  add column if not exists campaign bigint,
  add column if not exists road jsonb;

create table if not exists public.expedition_campaigns (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  season      text not null,
  key         text not null check (key in ('broken_map', 'lost_print')),
  stage       smallint not null default 0 check (stage between 0 and 3),
  runs        bigint[] not null default '{}',
  -- The places the next stage walks, one key per checkpoint; null before
  -- the first stage (its road is the run's own draw) and after the last.
  road        jsonb,
  log         jsonb not null default '[]'::jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  abandoned   boolean not null default false,
  relic       bigint
);

create unique index if not exists expedition_campaigns_open_idx
  on public.expedition_campaigns (discord_id, season) where finished_at is null;

alter table public.expedition_runs
  drop constraint if exists expedition_runs_campaign_fkey,
  add constraint expedition_runs_campaign_fkey foreign key (campaign) references public.expedition_campaigns(id);

alter table public.expedition_campaigns enable row level security;

create policy expedition_campaigns_owner_read on public.expedition_campaigns
  for select using (
    discord_id in (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

grant select on public.expedition_campaigns to authenticated;
grant all on public.expedition_campaigns to service_role;

-- The three stages of each campaign, held equal to CAMPAIGNS in
-- src/lib/expeditions/campaigns.ts by campaigns.test.ts.
create or replace function public.expedition_campaign_tier(p_key text, p_stage int) returns text
language sql
immutable
as $$
  select case p_key
    when 'broken_map' then (array['scout', 'raid', 'legend'])[p_stage + 1]
    when 'lost_print' then (array['raid', 'legend', 'legendary'])[p_stage + 1]
  end
$$;

create or replace function public.start_expedition_campaign(p_user text, p_season text, p_key text)
returns public.expedition_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row expedition_campaigns%rowtype;
begin
  if p_key not in ('broken_map', 'lost_print') then raise exception 'unknown campaign'; end if;
  if p_season is null or p_season = '' then raise exception 'unknown season'; end if;
  perform 1 from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown collector'; end if;
  if exists (select 1 from expedition_campaigns c where c.discord_id = p_user and c.season = p_season and c.finished_at is null) then
    raise exception 'campaign already open';
  end if;
  insert into expedition_campaigns (discord_id, season, key) values (p_user, p_season, p_key) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.bind_expedition_campaign(p_user text, p_run bigint, p_campaign bigint)
returns public.expedition_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_camp expedition_campaigns%rowtype;
  v_run  expedition_runs%rowtype;
begin
  select * into v_camp from expedition_campaigns c where c.id = p_campaign and c.discord_id = p_user for update;
  if not found then raise exception 'unknown campaign'; end if;
  if v_camp.finished_at is not null then raise exception 'campaign closed'; end if;
  if v_camp.stage >= 3 then raise exception 'campaign finished'; end if;
  if coalesce(array_length(v_camp.runs, 1), 0) > v_camp.stage then raise exception 'stage already out'; end if;
  select * into v_run from expedition_runs r where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.claimed_at is not null then raise exception 'already claimed'; end if;
  if v_run.campaign is not null then raise exception 'run already bound'; end if;
  if v_run.tier <> expedition_campaign_tier(v_camp.key, v_camp.stage) then raise exception 'wrong route for the stage'; end if;
  update expedition_runs set campaign = p_campaign, road = v_camp.road where id = p_run;
  update expedition_campaigns set runs = runs || p_run where id = p_campaign returning * into v_camp;
  return v_camp;
end;
$$;

create or replace function public.advance_expedition_campaign(
  p_user text, p_campaign bigint, p_road jsonb, p_log jsonb, p_relic_from bigint
) returns public.expedition_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_camp  expedition_campaigns%rowtype;
  v_run   expedition_runs%rowtype;
  v_last  bigint;
  v_relic bigint;
  v_stamp date := (now() at time zone 'utc')::date;
begin
  select * into v_camp from expedition_campaigns c where c.id = p_campaign and c.discord_id = p_user for update;
  if not found then raise exception 'unknown campaign'; end if;
  if v_camp.finished_at is not null then raise exception 'campaign closed'; end if;
  if v_camp.stage >= 3 then raise exception 'campaign finished'; end if;
  if coalesce(array_length(v_camp.runs, 1), 0) <> v_camp.stage + 1 then raise exception 'no run out for this stage'; end if;
  v_last := v_camp.runs[array_length(v_camp.runs, 1)];
  select * into v_run from expedition_runs r where r.id = v_last;
  if not found or v_run.claimed_at is null then raise exception 'stage not claimed'; end if;
  if jsonb_typeof(p_log) is distinct from 'object' then raise exception 'bad log'; end if;
  if p_road is not null and jsonb_typeof(p_road) <> 'array' then raise exception 'bad road'; end if;

  update expedition_campaigns
    set stage = stage + 1,
        road = p_road,
        log = log || jsonb_build_array(p_log)
    where id = p_campaign
    returning * into v_camp;

  if v_camp.stage = 3 then
    if p_relic_from is not null then
      if not (p_relic_from = any(v_run.squad)) then raise exception 'relic not in squad'; end if;
      -- A one-off print of the survivor, in the campaign's frame: matte,
      -- unsigned, its own print number from the trigger, the road it
      -- walked in its json and nothing else the original carried.
      insert into card_inventory
        (discord_id, season, slug, player_name, role, edition_week, overall, tier, foil, foil_type, signed, card, pack_open_id)
      select ci.discord_id, ci.season, ci.slug, ci.player_name, ci.role, ci.edition_week, ci.overall, ci.tier, false, null, false,
             jsonb_set(
               ci.card - 'trail' - 'mutation' - 'wounded' - 'expedition' - 'echo' - 'slab' - 'stattrak' - 'wear' - 'shiny' - 'secret',
               '{campaign}',
               jsonb_build_object('key', v_camp.key, 'date', to_char(v_stamp, 'YYYY-MM-DD'), 'campaign', p_campaign, 'runs', to_jsonb(v_camp.runs), 'from', p_relic_from)),
             null
        from card_inventory ci
        where ci.id = p_relic_from and ci.discord_id = p_user
        returning id into v_relic;
      if v_relic is null then raise exception 'relic bearer gone'; end if;
    end if;
    update expedition_campaigns set finished_at = now(), relic = v_relic where id = p_campaign returning * into v_camp;
  end if;
  return v_camp;
end;
$$;

create or replace function public.abandon_expedition_campaign(p_user text, p_campaign bigint)
returns public.expedition_campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_camp expedition_campaigns%rowtype;
begin
  select * into v_camp from expedition_campaigns c where c.id = p_campaign and c.discord_id = p_user for update;
  if not found then raise exception 'unknown campaign'; end if;
  if v_camp.finished_at is not null then raise exception 'campaign closed'; end if;
  update expedition_campaigns set finished_at = now(), abandoned = true where id = p_campaign returning * into v_camp;
  return v_camp;
end;
$$;

revoke all on function public.expedition_campaign_tier(text, int) from public, anon, authenticated;
grant execute on function public.expedition_campaign_tier(text, int) to service_role, anon, authenticated;
revoke all on function public.start_expedition_campaign(text, text, text) from public, anon, authenticated;
revoke all on function public.bind_expedition_campaign(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.advance_expedition_campaign(text, bigint, jsonb, jsonb, bigint) from public, anon, authenticated;
revoke all on function public.abandon_expedition_campaign(text, bigint) from public, anon, authenticated;
grant execute on function public.start_expedition_campaign(text, text, text) to service_role;
grant execute on function public.bind_expedition_campaign(text, bigint, bigint) to service_role;
grant execute on function public.advance_expedition_campaign(text, bigint, jsonb, jsonb, bigint) to service_role;
grant execute on function public.abandon_expedition_campaign(text, bigint) to service_role;
