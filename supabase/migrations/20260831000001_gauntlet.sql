-- The Gauntlet: run storage and its two money doors.
--
-- A run is one row that mutates through a small state machine:
--   active --fight lost--> fallen
--   active --retreat------> banked   (score kept, run over)
--   active --round 8 won--> cleared
-- Every fight's seed is rolled by CSPRNG and STORED before the fight
-- resolves, so resolution is a pure function of the row — replayable,
-- auditable, and safe to retry (the app's CAS update makes exactly one
-- write win; a rerun of the same seed produces the same fight).
--
-- One ACTIVE run per user per week (partial unique index). Finished runs
-- accumulate — each costs the entry fee, and the leaderboard reads the
-- week's best, so grinding pays the sink without farming the board.
--
-- Deny-all RLS like card_inventory: every read and write goes through
-- server actions holding the service role, where ownership is checked.

create table if not exists public.gauntlet_runs (
  id            bigint generated always as identity primary key,
  discord_id    text not null references public.betting_profiles(discord_id),
  season        text not null,
  -- Monday of the run's week — the leaderboard's shelf key.
  week_start    date not null,
  -- The five GauntletCards, frozen at entry (Fresh Legs marks included).
  lineup        jsonb not null,
  -- Raw lineup average the bracket scales from. Frozen so a mid-run bench
  -- swap can't soften later rounds.
  lineup_avg    numeric not null,
  -- The NEXT round to fight, 1-8.
  round         int not null default 1 check (round between 1 and 9),
  score         bigint not null default 0 check (score >= 0),
  -- Held relic keys, in pick order.
  relics        jsonb not null default '[]'::jsonb,
  -- The pending 3-key offer after a won round; null means the next step
  -- is a fight. Doubles as the state flag between fight and pick.
  relic_offer   jsonb,
  bench_swap_used boolean not null default false,
  status        text not null default 'active' check (status in ('active', 'fallen', 'banked', 'cleared')),
  -- The seed the NEXT fight resolves with — written before the fight.
  round_seed    bigint,
  -- The generated opponent that seed fights (scouting shows it too).
  next_opponent jsonb,
  -- The latest resolved fight, whole, for the timeline render.
  last_result   jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists gauntlet_one_active
  on public.gauntlet_runs (discord_id) where status = 'active';

-- The leaderboard's read: best score per user per week.
create index if not exists gauntlet_week_scores
  on public.gauntlet_runs (season, week_start, score desc);

alter table public.gauntlet_runs enable row level security;
grant all on public.gauntlet_runs to service_role;

-- === gauntlet_enter ==========================================================
-- The entry fee, with open_card_pack's exact discipline: lock the wallet,
-- refuse a short balance, ledger row and balance move as THE SAME NUMBER
-- in one transaction. Returns the new balance.

create or replace function public.gauntlet_enter(p_user text, p_fee bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_fee <= 0 then raise exception 'fee must be positive'; end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_balance < p_fee then raise exception 'insufficient balance'; end if;

  insert into betting_ledger(discord_id, delta, reason)
    values (p_user, -p_fee, 'gauntlet_entry');
  update betting_profiles set balance = balance - p_fee where discord_id = p_user;

  return v_balance - p_fee;
end;
$$;

grant execute on function public.gauntlet_enter(text, bigint) to service_role;

-- === gauntlet_payout =========================================================
-- The prize door (weekly pot shares, round-4 dust scraps, and the
-- compensating refund when a charged entry's run-insert fails). Positive
-- only; same one-transaction ledger+balance pairing. p_reason is
-- constrained to the gauntlet's own labels so the function can't be
-- borrowed as a general credit faucet.

create or replace function public.gauntlet_payout(p_user text, p_amount bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'payout must be positive'; end if;
  if p_reason not in ('gauntlet_prize', 'gauntlet_scraps', 'gauntlet_refund') then
    raise exception 'unknown gauntlet payout reason %', p_reason;
  end if;

  select balance into v_balance from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  insert into betting_ledger(discord_id, delta, reason)
    values (p_user, p_amount, p_reason);
  update betting_profiles set balance = balance + p_amount where discord_id = p_user;

  return v_balance + p_amount;
end;
$$;

grant execute on function public.gauntlet_payout(text, bigint, text) to service_role;
