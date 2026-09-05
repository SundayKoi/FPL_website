-- The Gauntlet's purse: bank or push.
--
-- Every cleared round adds to `purse` (the schedule is PURSE_STEPS in
-- src/lib/gauntlet/purse.ts; the app writes the running total with the
-- round's CAS update). Between fights the player may cash it out — the run
-- ends 'banked' and the purse is paid — and a full clear pays it too. A
-- loss leaves it where it is: `purse` stays on the row for the record and
-- `purse_paid` stays zero. Walking away mid-fight (crossroads pending)
-- also pays nothing: the purse is on the table from the first half to the
-- whistle.
--
-- One door, gauntlet_cash_out, does the transition AND the payment under
-- the run's row lock, so a double-click can't bank twice and a cleared run
-- can't collect twice. The weekly pot (settle.ts) subtracts what the
-- purses paid, so the league-wide sink is unchanged: prizes plus purses
-- never exceed what the week's entries paid.

alter table public.gauntlet_runs
  add column if not exists purse bigint not null default 0 check (purse >= 0),
  add column if not exists purse_paid bigint not null default 0 check (purse_paid >= 0);

-- gauntlet_payout learns the purse's label. Re-declared in full; the only
-- change is the reason list.
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
  if p_reason not in ('gauntlet_prize', 'gauntlet_scraps', 'gauntlet_refund', 'gauntlet_purse') then
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

-- === gauntlet_cash_out =======================================================
-- Banks a live run between fights, or collects a cleared run's purse.
-- Returns what was paid (0 on an empty purse) and the new balance.

create or replace function public.gauntlet_cash_out(p_user text, p_run bigint)
returns table(paid bigint, balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     gauntlet_runs%rowtype;
  v_balance bigint;
begin
  select * into v_run from gauntlet_runs r where r.id = p_run and r.discord_id = p_user for update;
  if not found then raise exception 'unknown run'; end if;
  if v_run.purse_paid > 0 then raise exception 'already paid'; end if;

  if v_run.status = 'active' then
    if v_run.crossroads is not null then raise exception 'fight in progress'; end if;
    update gauntlet_runs
      set status = 'banked', relic_offer = null, crossroads = null, round_seed = null, updated_at = now()
      where id = p_run;
  elsif v_run.status <> 'cleared' then
    raise exception 'run is over';
  end if;

  update gauntlet_runs set purse_paid = v_run.purse where id = p_run;

  select betting_profiles.balance into v_balance from betting_profiles
    where betting_profiles.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_run.purse > 0 then
    insert into betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_user, v_run.purse, 'gauntlet_purse', 'gauntlet_runs', p_run);
    update betting_profiles set balance = betting_profiles.balance + v_run.purse
      where betting_profiles.discord_id = p_user;
    v_balance := v_balance + v_run.purse;
  end if;

  return query select v_run.purse, v_balance;
end;
$$;

revoke all on function public.gauntlet_cash_out(text, bigint) from public, anon, authenticated;
grant execute on function public.gauntlet_cash_out(text, bigint) to service_role;
