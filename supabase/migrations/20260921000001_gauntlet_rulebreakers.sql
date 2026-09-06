-- Gauntlet: the rule-changing relics and drafted mode.
--
-- Three relics keep state on the run row: THE SECOND WIND (one caught
-- loss), THE REMATCH (one re-rolled offer) and — for drafted mode — the
-- fact that the five came from a dealt hand. A hand is dealt by the app
-- from the player's own shelf (src/lib/gauntlet/drafted.ts) and recorded
-- here so the entry can check the five against it; `run_id` marks it
-- used, and a hand is one run's.

alter table public.gauntlet_runs
  add column if not exists second_wind_used boolean not null default false,
  add column if not exists reroll_used boolean not null default false,
  add column if not exists drafted boolean not null default false;

create table if not exists public.gauntlet_deals (
  id         bigint generated always as identity primary key,
  discord_id text not null references public.betting_profiles(discord_id),
  season     text not null,
  week_start date not null,
  ids        bigint[] not null,
  run_id     bigint references public.gauntlet_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists gauntlet_deals_owner_idx on public.gauntlet_deals (discord_id, created_at desc);

alter table public.gauntlet_deals enable row level security;
grant all on public.gauntlet_deals to service_role;
