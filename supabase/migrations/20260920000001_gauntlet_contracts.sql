-- Gauntlet contracts and openers.
--
-- A contract is a printed weekly objective (src/lib/gauntlet/contracts.ts)
-- checked by the app against every round won and paid ONCE per player
-- per week: the primary key here is the "once", and the door below pays
-- only when its insert lands. The season's count of finished contracts is
-- what unlocks openers (src/lib/gauntlet/openers.ts); a run records the
-- opener it brought, like it records its heirloom.

create table if not exists public.gauntlet_contracts (
  discord_id   text not null references public.betting_profiles(discord_id),
  season       text not null,
  week_start   date not null,
  contract_key text not null,
  run_id       bigint references public.gauntlet_runs(id) on delete set null,
  reward       bigint not null default 0 check (reward >= 0),
  completed_at timestamptz not null default now(),
  primary key (discord_id, season, week_start, contract_key)
);

create index if not exists gauntlet_contracts_season_idx on public.gauntlet_contracts (discord_id, season);

alter table public.gauntlet_contracts enable row level security;
grant all on public.gauntlet_contracts to service_role;

alter table public.gauntlet_runs
  add column if not exists opener text;

-- gauntlet_payout learns the contract's label. Re-declared in full; the
-- only change is the reason list.
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
  if p_reason not in ('gauntlet_prize', 'gauntlet_scraps', 'gauntlet_refund', 'gauntlet_purse', 'gauntlet_contract') then
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

-- === gauntlet_complete_contract ==============================================
-- Records a contract and pays it, once. Returns the reward paid (0 when
-- the week already had it — a raced retry, or a second round that also
-- satisfied it).

create or replace function public.gauntlet_complete_contract(
  p_user text, p_season text, p_week date, p_key text, p_run bigint, p_reward bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reward < 0 or p_reward > 100 then raise exception 'bad reward'; end if;
  insert into gauntlet_contracts (discord_id, season, week_start, contract_key, run_id, reward)
    values (p_user, p_season, p_week, p_key, p_run, p_reward)
  on conflict do nothing;
  if not found then return 0; end if;
  if p_reward > 0 then
    perform gauntlet_payout(p_user, p_reward, 'gauntlet_contract');
  end if;
  return p_reward;
end;
$$;

revoke all on function public.gauntlet_complete_contract(text, text, date, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.gauntlet_complete_contract(text, text, date, text, bigint, bigint) to service_role;
