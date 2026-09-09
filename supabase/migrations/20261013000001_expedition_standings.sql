-- Expedition standings: the season's roads, scored, and three marks for
-- the top of them at season close.
--
-- expedition_standings is a view over claimed runs, one row per (season,
-- collector): the miles walked (expedition_trail_miles per run, whether
-- or not everyone came home — the road was walked), the loot brought home
-- (the outcome's dollars), the Legendary homecomings (a Legendary route
-- claimed with nobody lost or dead) and the rivals beaten (company.ts's
-- rivals with won = true). A leaderboard, so it is readable by everyone
-- the way betting_leaderboard is: a view reads with its owner's rights,
-- which is what lets it total rows the RLS on expedition_runs keeps to
-- their owners; the columns it shows are the ones every public card
-- surface already shows (a username, an avatar, totals).
--
-- expedition_accolades holds the marks — Pathfinder (most miles),
-- Plunderer (most loot), Survivor (most Legendary homecomings) — one of
-- each per season, awarded by close_expedition_season: a staff action
-- (service role only; the app checks the admin), idempotent, and a mark
-- only ever goes to a total above zero. Marks only: no dollars change
-- hands at season close, so the standings are a reason to go out and
-- never a grind.

create or replace view public.expedition_standings as
with claimed as (
  select r.season, r.discord_id, r.tier, r.outcome
  from public.expedition_runs r
  where r.claimed_at is not null and r.tier <> 'lost'
),
scored as (
  select
    season,
    discord_id,
    count(*)::int as runs,
    coalesce(sum(public.expedition_trail_miles(tier)), 0)::int as miles,
    coalesce(sum(coalesce((outcome ->> 'dollars')::bigint, 0)), 0)::bigint as loot,
    count(*) filter (
      where tier = 'legendary'
        and not exists (
          select 1 from jsonb_array_elements(coalesce(outcome -> 'fates', '[]'::jsonb)) f
          where f ->> 'fate' in ('lost', 'dead')
        )
    )::int as survivals,
    coalesce(sum((
      select count(*) from jsonb_array_elements(
        case when jsonb_typeof(outcome -> 'rivals') = 'array' then outcome -> 'rivals' else '[]'::jsonb end) v
      where (v ->> 'won')::boolean is true
    )), 0)::int as rivals_beaten
  from claimed
  group by season, discord_id
)
select
  s.season,
  s.discord_id,
  coalesce(p.username, 'Unknown') as username,
  p.avatar_url,
  s.runs,
  s.miles,
  s.loot,
  s.survivals,
  s.rivals_beaten
from scored s
left join public.betting_profiles p on p.discord_id = s.discord_id;

grant select on public.expedition_standings to anon, authenticated, service_role;

create table if not exists public.expedition_accolades (
  id          bigint generated always as identity primary key,
  season      text not null,
  kind        text not null check (kind in ('pathfinder', 'plunderer', 'survivor')),
  discord_id  text not null references public.betting_profiles(discord_id),
  value       bigint not null,
  awarded_at  timestamptz not null default now(),
  unique (season, kind)
);

alter table public.expedition_accolades enable row level security;

-- A mark is league news: readable by everyone, written only by the close.
create policy expedition_accolades_public_read on public.expedition_accolades
  for select using (true);

grant select on public.expedition_accolades to anon, authenticated;
grant all on public.expedition_accolades to service_role;

create or replace function public.close_expedition_season(p_season text)
returns setof public.expedition_accolades
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_stat text;
  v_who  text;
  v_val  bigint;
begin
  if p_season is null or p_season = '' then raise exception 'unknown season'; end if;
  for v_kind, v_stat in
    select * from (values ('pathfinder', 'miles'), ('plunderer', 'loot'), ('survivor', 'survivals')) k(kind, stat)
  loop
    -- The top of the standing, ties to the lower discord id so the pick
    -- is the same one the app previews.
    execute format(
      'select discord_id, %I::bigint from public.expedition_standings where season = $1 and %I > 0 order by %I desc, discord_id limit 1',
      v_stat, v_stat, v_stat)
      into v_who, v_val using p_season;
    if v_who is null then continue; end if;
    insert into expedition_accolades (season, kind, discord_id, value)
    values (p_season, v_kind, v_who, v_val)
    on conflict on constraint expedition_accolades_season_kind_key do nothing;
  end loop;
  return query select * from expedition_accolades a where a.season = p_season order by a.kind;
end;
$$;

revoke all on function public.close_expedition_season(text) from public, anon, authenticated;
grant execute on function public.close_expedition_season(text) to service_role;
