-- The league's expedition of the week: one shared goal per (season,
-- Eastern week), walked toward by everyone's claimed runs, and one map
-- fragment to each collector who helped when it falls.
-- Spec: docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md §3.
--
-- The goal itself is derived, not configured: src/lib/expeditions/league.ts
-- decides the week's kind (a LANDMARK walked to on trail miles, or a BOSS
-- worn down by pushes at forks), its size (LANDMARK_MILES, BOSS_HEALTH) and
-- its name (off the week's first fixture). The database keeps only what is
-- genuinely state: that a goal fell, and who was paid for it.
--
--   1. expedition_league_progress — a view over claimed runs, one row per
--      (season, week, collector): the miles walked (expedition_trail_miles,
--      the standings' measure) and the pushes landed (the claimed outcome's
--      `pushes`). A run counts for the Eastern week it LAUNCHED in — the
--      calendar the weather and the brief keep — and only once claimed; a
--      hold (tier 'lost') is not a run. Public, like expedition_standings:
--      a view reads with its owner's rights, which is what lets it total
--      rows the RLS on expedition_runs keeps to their owners, and the
--      columns it shows are the ones the standings already show.
--
--   2. expedition_league_goals / expedition_league_rewards — a goal that
--      fell, and one row per collector paid for it. League news: readable
--      by everyone, written only by the RPC below.
--
--   3. fell_expedition_league_goal — the one place a goal falls. Service
--      role only; the sweep (src/lib/expeditions/leagueSweep.ts) calls it
--      when the view says a week has reached its size. It recomputes the
--      week itself rather than trusting the caller, and it is idempotent
--      exactly like close_expedition_season: the goal row's primary key is
--      the lock, so a second call (or a racing sweep) pays nobody twice.
--
-- League isolation: Premier and Academy keep separate season labels (S5,
-- A1 — 20260823000001), every run is stamped with one, and every read and
-- write here is keyed by it. Nothing one league walks counts toward the
-- other's week; a collector who plays both is paid by each separately,
-- into the one season-blind fragment pouch they already have.
--
-- Deploy safety: the app reads all three through fail-soft queries (a
-- missing view or table hides the panel) and the sweep catches a missing
-- function and skips, so the code can ship ahead of this migration. The
-- migration depends on no data, so it can land after the code.

-- === 1. progress =============================================================

create or replace view public.expedition_league_progress as
with claimed as (
  select
    r.season,
    date_trunc('week', r.started_at at time zone 'America/New_York')::date as week_start,
    r.discord_id,
    public.expedition_trail_miles(r.tier) as miles,
    -- Defensive about the json: a run from before forks has no `pushes`,
    -- and a non-number there must not break the whole league's view.
    case
      when jsonb_typeof(r.outcome -> 'pushes') = 'number'
        then greatest(0, floor((r.outcome ->> 'pushes')::numeric))::int
      else 0
    end as pushes
  from public.expedition_runs r
  where r.claimed_at is not null and r.tier <> 'lost'
),
scored as (
  select
    season,
    week_start,
    discord_id,
    coalesce(sum(miles), 0)::int as miles,
    coalesce(sum(pushes), 0)::int as pushes
  from claimed
  group by season, week_start, discord_id
)
select
  s.season,
  s.week_start,
  s.discord_id,
  coalesce(p.username, 'Unknown') as username,
  s.miles,
  s.pushes
from scored s
left join public.betting_profiles p on p.discord_id = s.discord_id;

grant select on public.expedition_league_progress to anon, authenticated, service_role;

-- === 2. goals that fell, and who was paid ====================================

create table if not exists public.expedition_league_goals (
  season     text not null,
  -- The Eastern Monday of the week, as date_trunc('week') gives it.
  week_start date not null check (extract(isodow from week_start) = 1),
  kind       text not null check (kind in ('landmark', 'boss')),
  target     int  not null check (target > 0),
  fell_at    timestamptz not null default now(),
  -- The Vanguard: whoever did the most when it fell.
  top_id     text references public.betting_profiles(discord_id),
  primary key (season, week_start)
);

create table if not exists public.expedition_league_rewards (
  season     text not null,
  week_start date not null,
  discord_id text not null references public.betting_profiles(discord_id),
  fragments  int  not null default 1 check (fragments > 0),
  top        boolean not null default false,
  awarded_at timestamptz not null default now(),
  primary key (season, week_start, discord_id),
  foreign key (season, week_start) references public.expedition_league_goals(season, week_start)
);

alter table public.expedition_league_goals enable row level security;
alter table public.expedition_league_rewards enable row level security;

drop policy if exists expedition_league_goals_public_read on public.expedition_league_goals;
create policy expedition_league_goals_public_read on public.expedition_league_goals
  for select using (true);

drop policy if exists expedition_league_rewards_public_read on public.expedition_league_rewards;
create policy expedition_league_rewards_public_read on public.expedition_league_rewards
  for select using (true);

grant select on public.expedition_league_goals to anon, authenticated;
grant select on public.expedition_league_rewards to anon, authenticated;
grant all on public.expedition_league_goals to service_role;
grant all on public.expedition_league_rewards to service_role;

-- === 3. the fall =============================================================
--
-- p_kind and p_target are the app's (league.ts), checked here only for
-- shape: the size is defined in one place, and the bounds below only stop
-- a slip — a goal of one mile would pay the whole league every week. The
-- progress is NOT the caller's: it is recomputed from the runs through the
-- view, so a caller can decide when to ask but never what the answer is.
--
-- A goal that has not fallen by the end of the following week stops being
-- evaluated: a call for an older week answers (false, 0, null) whatever
-- its runs now say, so a squad claimed long after its week cannot reopen
-- it. A goal that already fell answers (true, 0, top) forever.

create or replace function public.fell_expedition_league_goal(p_season text, p_week date, p_kind text, p_target int)
returns table(fell boolean, rewarded int, top_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_this     date := date_trunc('week', now() at time zone 'America/New_York')::date;
  v_total    int;
  v_top      text;
  v_inserted int;
  v_paid     int;
begin
  if p_season is null or p_season = '' then raise exception 'unknown season'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 or p_week > v_this then raise exception 'bad week'; end if;
  if p_kind is null or p_kind not in ('landmark', 'boss') then raise exception 'bad kind'; end if;
  if p_target is null or p_target < 10 or p_target > 1000 then raise exception 'bad target'; end if;

  -- Fell already: say so, pay nobody. Every column is qualified: top_id
  -- is also this function's output column.
  select g.top_id into v_top
  from expedition_league_goals g
  where g.season = p_season and g.week_start = p_week;
  if found then
    return query select true, 0, v_top;
    return;
  end if;

  if p_week < v_this - 7 then
    return query select false, 0, null::text;
    return;
  end if;

  select coalesce(sum(case when p_kind = 'landmark' then lp.miles else lp.pushes end), 0)::int
    into v_total
  from expedition_league_progress lp
  where lp.season = p_season and lp.week_start = p_week;

  if v_total < p_target then
    return query select false, 0, null::text;
    return;
  end if;

  -- The Vanguard: the most, ties to the lower discord id in byte order,
  -- the same pick league.ts previews.
  select lp.discord_id into v_top
  from expedition_league_progress lp
  where lp.season = p_season and lp.week_start = p_week
    and (case when p_kind = 'landmark' then lp.miles else lp.pushes end) > 0
  order by (case when p_kind = 'landmark' then lp.miles else lp.pushes end) desc, lp.discord_id collate "C"
  limit 1;

  insert into expedition_league_goals (season, week_start, kind, target, top_id)
  values (p_season, p_week, p_kind, p_target, v_top)
  on conflict on constraint expedition_league_goals_pkey do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- A sweep racing this one got the row first (the insert waited for
    -- it to commit), and that sweep paid.
    select g.top_id into v_top
    from expedition_league_goals g
    where g.season = p_season and g.week_start = p_week;
    return query select true, 0, v_top;
    return;
  end if;

  -- One fragment to every collector who put at least one mile (or push)
  -- in, and the fragment lands in the same statement as the reward row.
  with contributors as (
    select lp.discord_id
    from expedition_league_progress lp
    where lp.season = p_season and lp.week_start = p_week
      and (case when p_kind = 'landmark' then lp.miles else lp.pushes end) > 0
  ),
  paid as (
    insert into expedition_league_rewards (season, week_start, discord_id, fragments, top)
    select p_season, p_week, c.discord_id, 1, coalesce(c.discord_id = v_top, false)
    from contributors c
    on conflict on constraint expedition_league_rewards_pkey do nothing
    returning expedition_league_rewards.discord_id, expedition_league_rewards.fragments
  ),
  stocked as (
    insert into expedition_supplies (discord_id, fragments)
    select paid.discord_id, paid.fragments from paid
    on conflict on constraint expedition_supplies_pkey
    do update set fragments = expedition_supplies.fragments + excluded.fragments, updated_at = now()
    returning 1
  )
  select count(*)::int into v_paid from stocked;

  return query select true, v_paid, v_top;
end;
$$;

revoke all on function public.fell_expedition_league_goal(text, date, text, int) from public, anon, authenticated;
grant execute on function public.fell_expedition_league_goal(text, date, text, int) to service_role;
