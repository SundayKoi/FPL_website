-- Gauntlet ascension: the ladder above a clear.
--
-- Clear all eight rounds at your current level and the next unlocks for
-- the season (src/lib/gauntlet/ascension.ts names each level's rule).
-- Every run is stamped with the level it was fought at; the board and
-- the purse weigh it by that level in the app. `gauntlet_ascension` is
-- one row per player per season: what they have unlocked, and how many
-- clears got them there. The door, gauntlet_ascend, is called by the
-- claim of a cleared run and is idempotent — unlocking is a `greatest`.

alter table public.gauntlet_runs
  add column if not exists ascension smallint not null default 0 check (ascension between 0 and 5);

create table if not exists public.gauntlet_ascension (
  discord_id text not null references public.betting_profiles(discord_id),
  season     text not null,
  unlocked   smallint not null default 0 check (unlocked between 0 and 5),
  clears     int not null default 0 check (clears >= 0),
  updated_at timestamptz not null default now(),
  primary key (discord_id, season)
);

alter table public.gauntlet_ascension enable row level security;
grant all on public.gauntlet_ascension to service_role;

-- The balance tape learns the level, so the report can read a relic's
-- lift at level 3 apart from its lift at level 0.
alter table public.gauntlet_round_log
  add column if not exists ascension smallint not null default 0;

create or replace function public.gauntlet_ascend(p_user text, p_season text, p_level int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int := least(5, greatest(0, p_level) + 1);
  v_now  int;
begin
  perform 1 from betting_profiles where discord_id = p_user;
  if not found then raise exception 'unknown user %', p_user; end if;
  insert into gauntlet_ascension (discord_id, season, unlocked, clears)
    values (p_user, p_season, v_next, 1)
  on conflict (discord_id, season) do update
    set unlocked = greatest(gauntlet_ascension.unlocked, excluded.unlocked),
        clears = gauntlet_ascension.clears + 1,
        updated_at = now();
  select unlocked into v_now from gauntlet_ascension where discord_id = p_user and season = p_season;
  return v_now;
end;
$$;

revoke all on function public.gauntlet_ascend(text, text, int) from public, anon, authenticated;
grant execute on function public.gauntlet_ascend(text, text, int) to service_role;
