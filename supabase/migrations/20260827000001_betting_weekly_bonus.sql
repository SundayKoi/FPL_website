-- /weekly bonus for the betting bot: a bigger, slower twin of the daily
-- streak. Same shape as 20260813000002_betting_wallet_rpcs.sql's
-- claim_daily_streak/daily_next_at pair, on a 7-day rolling cooldown with a
-- 14-day grace before the streak breaks (daily uses 24h/48h). Tuning
-- (amount/step/max) stays in the Discord handler, like the daily's.

alter table public.betting_profiles add column if not exists last_weekly timestamptz;
alter table public.betting_profiles add column if not exists weekly_streak int not null default 0;

-- weekly_next_at: when can this wallet claim their weekly again? Returns
-- last_weekly + 7 days (the rolling cooldown enforced in
-- claim_weekly_streak), or NULL if they've never claimed (claimable now).
-- Read-only; callers show this as a countdown instead of a bare "already
-- claimed".
create or replace function public.weekly_next_at(p_user text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when last_weekly is null then null
              else last_weekly + interval '7 days' end
  from betting_profiles where discord_id = p_user;
$$;

-- claim_weekly_streak: weekly bonus with an escalating streak: base + step
-- per consecutive week, capped at p_max. Missing a week (>14 days since the
-- last claim) resets the streak to 1.
create or replace function public.claim_weekly_streak(
  p_user text, p_amount bigint, p_step bigint, p_max int
) returns table(amount bigint, balance bigint, streak int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_streak int;
  v_balance bigint;
  v_grant bigint;
begin
  select last_weekly, weekly_streak, betting_profiles.balance
    into v_last, v_streak, v_balance
    from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_last is not null and now() - v_last < interval '7 days' then
    raise exception 'weekly already claimed';
  end if;

  if v_last is null or now() - v_last >= interval '14 days' then
    v_streak := 1;                       -- first claim or missed a week
  else
    v_streak := least(v_streak + 1, p_max);
  end if;

  v_grant := p_amount + p_step * (v_streak - 1);
  insert into betting_ledger(discord_id, delta, reason) values (p_user, v_grant, 'weekly');
  -- balance is qualified below: this function's RETURNS TABLE declares an
  -- OUT variable named "balance" that would otherwise shadow the column.
  update betting_profiles set balance = betting_profiles.balance + v_grant,
      last_weekly = now(), weekly_streak = v_streak
    where discord_id = p_user;

  return query select v_grant, v_balance + v_grant, v_streak;
end;
$$;

-- Same controller ruling as the daily pair (20260813000003): the betting RPC
-- surface is service_role-only.
revoke execute on function
  public.claim_weekly_streak(text, bigint, bigint, int),
  public.weekly_next_at(text)
from public, anon, authenticated;

grant execute on function
  public.claim_weekly_streak(text, bigint, bigint, int),
  public.weekly_next_at(text)
to service_role;
