-- The Gauntlet's weekly settlement ledger.
--
-- One row per (season, week) IS the settlement — the Monday job claims it
-- by primary-key insert BEFORE paying anything (burn-first, like every
-- spend in this economy), so a re-run of the job can never pay a week
-- twice. `pot` and `paid` are recorded for the audit trail; the payouts
-- themselves go through gauntlet_payout, so ledger and balances stay one
-- number as always.

create table if not exists public.gauntlet_settlements (
  season     text not null,
  week_start date not null,
  pot        bigint not null default 0,
  paid       bigint not null default 0,
  settled_at timestamptz not null default now(),
  primary key (season, week_start)
);

alter table public.gauntlet_settlements enable row level security;
grant all on public.gauntlet_settlements to service_role;
