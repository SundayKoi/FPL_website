-- Moment cards: one rare single-game performance, kept as its own card.
--
-- A player card is a season average, and averaging is exactly what buries
-- the one night someone went off. This table is the other half — one game,
-- the real stat line, the date it happened.
--
-- Deliberately small and append-only. The detector (scripts/detect-moments.ts)
-- decides what qualifies and how many may mint in a week; this just holds
-- what it chose, keyed so a re-run cannot mint the same performance twice.

create table if not exists public.card_moments (
  id bigint generated always as identity primary key,
  season text not null,
  -- Monday of the week the game belongs to, so the weekly cap has
  -- something to count and the archive can be read a week at a time.
  week_start date not null,
  match_id text not null,
  slug text not null,
  summoner_name text not null,
  tag text not null,
  team_name text,
  champion text,
  role text,
  trigger_key text not null,
  title text not null,
  headline text not null,
  rarity int not null,
  game_date timestamptz,
  minted_at timestamptz not null default now()
);

-- One performance mints once. The detector is idempotent because of this:
-- re-running a week re-selects the same winners and the insert no-ops.
create unique index if not exists card_moments_unique_performance
  on public.card_moments (season, match_id, slug);

-- The wall reads newest first; the cap counts a season's week.
create index if not exists card_moments_week_idx
  on public.card_moments (season, week_start desc);

-- Public: a moment is a thing that happened in a league match, and the wall
-- renders for signed-out visitors. Writes are service-role only (the
-- detector), so there is no insert policy at all.
alter table public.card_moments enable row level security;

drop policy if exists card_moments_public_read on public.card_moments;
create policy card_moments_public_read on public.card_moments
  for select using (true);

grant select on public.card_moments to anon, authenticated;
grant all on public.card_moments to service_role;
