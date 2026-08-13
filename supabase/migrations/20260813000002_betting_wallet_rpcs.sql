-- Betting integration: wallet + economy RPCs. Ported from
-- c:\fpl_gambling\db\migrations (003_signup_bonus.sql, 002_rpcs.sql,
-- 017_daily_next.sql, 012_social.sql) with renames: users -> betting_profiles,
-- ledger -> betting_ledger. All RPCs are security definer so they can write
-- through RLS.

-- 012_social.sql adds daily_streak to the source `users` table; our schema
-- migration (Task 1) didn't carry it since streak logic lands here.
alter table public.betting_profiles add column if not exists daily_streak int not null default 0;

-- grant_signup_bonus: create the wallet on first login + one-time signup
-- credit. Idempotent and concurrency-safe: insert-first with
-- ON CONFLICT DO NOTHING. A row inserted => first login => credit the bonus.
-- No row inserted => existing wallet => refresh profile only, no extra
-- credit. Never raises on a race.
-- Extended over the 003_signup_bonus.sql source with p_profile_id: when
-- provided and the wallet has no linked profile yet, link it (one-time,
-- never overwrites an existing link).
create or replace function public.grant_signup_bonus(
  p_user text, p_username text, p_avatar text, p_amount bigint,
  p_profile_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  insert into betting_profiles(discord_id, username, avatar_url, balance)
    values (p_user, p_username, p_avatar, p_amount)
    on conflict (discord_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    insert into betting_ledger(discord_id, delta, reason) values (p_user, p_amount, 'signup');
  else
    update betting_profiles set username = p_username, avatar_url = p_avatar
      where discord_id = p_user;
  end if;

  if p_profile_id is not null then
    update betting_profiles set profile_id = p_profile_id
      where discord_id = p_user and profile_id is null;
  end if;
end;
$$;

-- daily_next_at: when can this wallet claim their daily again? Returns
-- last_daily + 24h (the rolling cooldown enforced in claim_daily_streak), or
-- NULL if they've never claimed (claimable now). Read-only; callers show
-- this as a countdown instead of a bare "already claimed".
create or replace function public.daily_next_at(p_user text)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when last_daily is null then null
              else last_daily + interval '24 hours' end
  from betting_profiles where discord_id = p_user;
$$;

-- claim_daily_streak: daily bonus with an escalating streak: base + step per
-- consecutive day, capped at p_max. Missing a day (>48h since last claim)
-- resets the streak to 1. Ported from 012_social.sql's claim_daily_streak,
-- returning a row instead of jsonb per the exposed interface.
create or replace function public.claim_daily_streak(
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
  select last_daily, daily_streak, betting_profiles.balance
    into v_last, v_streak, v_balance
    from betting_profiles where discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_last is not null and now() - v_last < interval '24 hours' then
    raise exception 'daily already claimed';
  end if;

  if v_last is null or now() - v_last >= interval '48 hours' then
    v_streak := 1;                       -- first claim or missed a day
  else
    v_streak := least(v_streak + 1, p_max);
  end if;

  v_grant := p_amount + p_step * (v_streak - 1);
  insert into betting_ledger(discord_id, delta, reason) values (p_user, v_grant, 'daily');
  -- balance is qualified below: this function's RETURNS TABLE declares an
  -- OUT variable named "balance" that would otherwise shadow the column.
  update betting_profiles set balance = betting_profiles.balance + v_grant,
      last_daily = now(), daily_streak = v_streak
    where discord_id = p_user;

  return query select v_grant, v_balance + v_grant, v_streak;
end;
$$;

-- tip_points: transfer points between two wallets (a tip). Atomic, ordered
-- locks to avoid deadlocks, both ledger rows in one tx. No fee — it's a
-- gift. Ported from 012_social.sql's tip_user, exposed as tip_points.
create or replace function public.tip_points(p_from text, p_to text, p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_first text;
  v_second text;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_from = p_to then raise exception 'cannot tip yourself'; end if;

  -- lock both rows in a stable order (deadlock-safe)
  v_first := least(p_from, p_to);
  v_second := greatest(p_from, p_to);
  perform 1 from betting_profiles where discord_id = v_first for update;
  perform 1 from betting_profiles where discord_id = v_second for update;

  select balance into v_balance from betting_profiles where discord_id = p_from;
  if v_balance is null then raise exception 'unknown user %', p_from; end if;
  if not exists (select 1 from betting_profiles where discord_id = p_to) then
    raise exception 'recipient has no account yet';
  end if;
  if v_balance < p_amount then raise exception 'insufficient balance'; end if;

  insert into betting_ledger(discord_id, delta, reason) values (p_from, -p_amount, 'tip_send');
  insert into betting_ledger(discord_id, delta, reason) values (p_to, p_amount, 'tip_recv');
  update betting_profiles set balance = balance - p_amount where discord_id = p_from
    returning balance into v_balance;  -- sender's new balance
  update betting_profiles set balance = balance + p_amount where discord_id = p_to;

  return v_balance;  -- sender's new balance
end;
$$;

-- No internal helper functions were added by this migration (all four
-- functions above are the public RPC surface), so there is nothing new to
-- revoke here — see 20260807000009_revoke_internal_fns.sql for the house
-- pattern this migration would otherwise follow.
