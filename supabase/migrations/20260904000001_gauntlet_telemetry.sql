-- The Gauntlet's balance tape.
--
-- Nothing in the run row survives long enough to answer the two questions
-- a balance pass actually asks: which call did they make at the
-- crossroads, and which relic did they take when three were on the table.
-- `crossroads` is nulled the moment the call resolves, `relic_offer` the
-- moment a relic is taken, and `last_result` only ever holds the LATEST
-- round. So the numbers get their own append-only tape here.
--
-- These are telemetry, not game state. Nothing reads them to resolve a
-- fight, a failed insert must never fail a round, and no player-facing
-- surface reads them — the report is staff-gated and aggregate. Deny-all
-- RLS like every other cards table; the service role writes and reads.
--
-- Idempotence: one row per (run, round) in each table, so the double-click
-- race the actions already guard with a CAS can't double-count a call. The
-- insert is `on conflict do nothing` — the first write is the true one.

create table if not exists public.gauntlet_round_log (
  id             bigint generated always as identity primary key,
  run_id         bigint not null references public.gauntlet_runs(id) on delete cascade,
  season         text   not null,
  week_start     date   not null,
  round          int    not null check (round between 1 and 9),
  -- The lineup the bracket was priced against — a call that looks strong
  -- may only look strong on thin shelves.
  lineup_avg     numeric not null,
  -- The call: which situation came up, and which line they took.
  situation_key  text   not null,
  choice_key     text   not null,
  -- How it went.
  won            boolean not null,
  score          int    not null,
  daring         int    not null,
  momentum       int    not null,
  -- The shape of the fight around the call.
  relics         text[] not null default '{}',
  opponent_avg   numeric,
  condition_key  text,
  boss_key       text,
  created_at     timestamptz not null default now(),
  constraint gauntlet_round_log_once unique (run_id, round)
);

-- The report reads a week at a time, then groups by the call.
create index if not exists gauntlet_round_log_week
  on public.gauntlet_round_log (season, week_start, id);
create index if not exists gauntlet_round_log_call
  on public.gauntlet_round_log (situation_key, choice_key);

alter table public.gauntlet_round_log enable row level security;
grant all on public.gauntlet_round_log to service_role;

-- === offers ==================================================================
-- A relic's pick rate is meaningless without its denominator: how often it
-- was ON THE TABLE. Three keys go out, one comes back.

create table if not exists public.gauntlet_relic_offers (
  id          bigint generated always as identity primary key,
  run_id      bigint not null references public.gauntlet_runs(id) on delete cascade,
  season      text   not null,
  week_start  date   not null,
  -- The round the taken relic will first fight in.
  round       int    not null check (round between 1 and 9),
  offered     text[] not null,
  taken       text   not null,
  -- What they already held when they chose — a relic that only ever wins
  -- as the fourth ember is a different card than one that carries alone.
  held        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  constraint gauntlet_relic_offers_once unique (run_id, round)
);

create index if not exists gauntlet_relic_offers_week
  on public.gauntlet_relic_offers (season, week_start, id);

alter table public.gauntlet_relic_offers enable row level security;
grant all on public.gauntlet_relic_offers to service_role;
