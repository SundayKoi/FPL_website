-- Patron recurring rewards. Eligibility is read after the wallet row is
-- locked, so every payout in this migration uses the patron status that is
-- true in the payout transaction. Existing ledger rows are never rewritten.

create or replace function public.calculate_recurring_reward(
  p_user text,
  p_base bigint,
  p_streak_step bigint,
  p_streak integer
) returns bigint
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_patron boolean;
begin
  if p_base <= 0 then raise exception 'base amount must be positive'; end if;
  if p_streak_step < 0 then raise exception 'streak step must be non-negative'; end if;
  if p_streak < 1 then raise exception 'streak must be positive'; end if;

  select bp.patron_until > now()
    into v_patron
    from public.betting_profiles bp
   where bp.discord_id = p_user;
  if not found then raise exception 'unknown user %', p_user; end if;

  return (case when coalesce(v_patron, false) then p_base * 3 / 2 else p_base end)
    + p_streak_step * (p_streak - 1);
end;
$$;

revoke all on function public.calculate_recurring_reward(text, bigint, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.calculate_recurring_reward(text, bigint, bigint, integer)
  to service_role;

-- Daily and weekly streaks keep their caller-supplied tuning, but only the
-- base component is patron-multiplied by the shared calculator.
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
  select bp.last_daily, bp.daily_streak, bp.balance
    into v_last, v_streak, v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_user
     for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_last is not null and now() - v_last < interval '24 hours' then
    raise exception 'daily already claimed';
  end if;

  if v_last is null or now() - v_last >= interval '48 hours' then
    v_streak := 1;
  else
    v_streak := least(v_streak + 1, p_max);
  end if;

  v_grant := public.calculate_recurring_reward(p_user, p_amount, p_step, v_streak);
  insert into public.betting_ledger(discord_id, delta, reason)
    values (p_user, v_grant, 'daily');
  update public.betting_profiles bp
     set balance = bp.balance + v_grant,
         last_daily = now(),
         daily_streak = v_streak
   where bp.discord_id = p_user;

  return query select v_grant, v_balance + v_grant, v_streak;
end;
$$;

revoke all on function public.claim_daily_streak(text, bigint, bigint, int)
  from public, anon, authenticated;
grant execute on function public.claim_daily_streak(text, bigint, bigint, int)
  to service_role;

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
  select bp.last_weekly, bp.weekly_streak, bp.balance
    into v_last, v_streak, v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_user
     for update;
  if not found then raise exception 'unknown user %', p_user; end if;
  if v_last is not null and now() - v_last < interval '7 days' then
    raise exception 'weekly already claimed';
  end if;

  if v_last is null or now() - v_last >= interval '14 days' then
    v_streak := 1;
  else
    v_streak := least(v_streak + 1, p_max);
  end if;

  v_grant := public.calculate_recurring_reward(p_user, p_amount, p_step, v_streak);
  insert into public.betting_ledger(discord_id, delta, reason)
    values (p_user, v_grant, 'weekly');
  update public.betting_profiles bp
     set balance = bp.balance + v_grant,
         last_weekly = now(),
         weekly_streak = v_streak
   where bp.discord_id = p_user;

  return query select v_grant, v_balance + v_grant, v_streak;
end;
$$;

revoke all on function public.claim_weekly_streak(text, bigint, bigint, int)
  from public, anon, authenticated;
grant execute on function public.claim_weekly_streak(text, bigint, bigint, int)
  to service_role;

-- Daily Stu records the exact amount paid on each vote. Existing rows default
-- to zero because their historical payout amount is not backfilled.
alter table public.daily_banger_votes
  add column if not exists reward_amount bigint not null default 0
  check (reward_amount >= 0);

drop function if exists public.vote_daily_banger(text, uuid, text, text);
create function public.vote_daily_banger(
  p_post_id text,
  p_voter_id uuid,
  p_discord_id text,
  p_vote text
)
returns table(balance bigint, reward_amount bigint, already_voted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := timezone('utc', now())::date;
  v_inserted boolean;
  v_balance bigint;
  v_reward_amount bigint := 0;
begin
  if p_vote not in ('banger', 'mid', 'stinker') then
    raise exception 'invalid vote';
  end if;

  perform 1
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     for update;
  if not found then raise exception 'unknown betting user'; end if;

  if not exists (
    select 1
      from public.daily_banger_checks dbc
     where dbc.check_date = v_date
       and dbc.post_id = p_post_id
  ) then
    raise exception 'daily check has changed';
  end if;

  v_reward_amount := public.calculate_recurring_reward(p_discord_id, 200, 0, 1);
  insert into public.daily_banger_votes(
    check_date, post_id, voter_id, discord_id, vote, reward_amount
  )
  values (v_date, p_post_id, p_voter_id, p_discord_id, p_vote, v_reward_amount)
  on conflict (check_date, voter_id) do nothing;
  v_inserted := found;

  if v_inserted then
    insert into public.betting_ledger(
      discord_id, delta, reason, ref_table, ref_id
    ) values (
      p_discord_id, v_reward_amount, 'daily_banger_vote', 'daily_banger_checks', null
    );

    update public.betting_profiles bp
       set balance = bp.balance + v_reward_amount
     where bp.discord_id = p_discord_id
    returning bp.balance into v_balance;
  else
    v_reward_amount := 0;
    select bp.balance into v_balance
      from public.betting_profiles bp
     where bp.discord_id = p_discord_id;
  end if;

  return query select v_balance, v_reward_amount, not v_inserted;
end;
$$;

revoke all on function public.vote_daily_banger(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.vote_daily_banger(text, uuid, text, text)
  to service_role;

-- FPL'dle already has a reward_amount column; this replacement only changes
-- the amount calculation and preserves its solve marker/reset semantics.
create or replace function public.record_fpldle_guess(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text,
  p_player_slug text,
  p_is_correct boolean
) returns table(
  accepted boolean,
  guess_count integer,
  reward_amount bigint,
  balance bigint,
  already_rewarded boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_progress_id bigint;
  v_guesses text[];
  v_completed_at timestamptz;
  v_first_solved_at timestamptz;
  v_reward_amount bigint;
  v_balance bigint;
  v_already_rewarded boolean := false;
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'FPLDLE_INVALID_LEAGUE';
  end if;
  if p_profile_id is null or p_discord_id is null or p_player_slug is null
     or p_player_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'FPLDLE_INVALID_GUESS';
  end if;

  select bp.balance into v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     and bp.profile_id = p_profile_id
     for update;
  if not found then raise exception 'FPLDLE_UNKNOWN_WALLET'; end if;

  insert into public.fpldle_daily_progress (puzzle_date, league, profile_id, discord_id)
  values (p_puzzle_date, p_league, p_profile_id, p_discord_id)
  on conflict (puzzle_date, league, profile_id) do nothing;

  select progress.id, progress.guesses, progress.completed_at,
         progress.first_solved_at, coalesce(progress.reward_amount, 0)
    into v_progress_id, v_guesses, v_completed_at,
         v_first_solved_at, v_reward_amount
    from public.fpldle_daily_progress progress
   where progress.puzzle_date = p_puzzle_date
     and progress.league = p_league
     and progress.profile_id = p_profile_id
     for update;
  v_already_rewarded := v_reward_amount > 0;

  if p_player_slug = any(v_guesses) then
    if v_reward_amount > 0 then
      return query select false, cardinality(v_guesses), v_reward_amount, v_balance, true;
      return;
    end if;
    raise exception 'FPLDLE_DUPLICATE_GUESS';
  end if;

  if v_completed_at is not null or cardinality(v_guesses) >= 5 then
    raise exception 'FPLDLE_PUZZLE_COMPLETE';
  end if;

  v_guesses := array_append(v_guesses, p_player_slug);

  if p_is_correct then
    v_completed_at := now();
    if v_first_solved_at is null then v_first_solved_at := v_completed_at; end if;
    if v_reward_amount = 0 then
      v_reward_amount := public.calculate_recurring_reward(p_discord_id, 200, 0, 1);
      insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
      values (p_discord_id, v_reward_amount, 'fpldle_completion', 'fpldle_daily_progress', v_progress_id);
      update public.betting_profiles bp
         set balance = bp.balance + v_reward_amount
       where bp.discord_id = p_discord_id;
      v_balance := v_balance + v_reward_amount;
    else
      v_already_rewarded := true;
    end if;
  end if;

  update public.fpldle_daily_progress
     set guesses = v_guesses,
         completed_at = v_completed_at,
         first_solved_at = v_first_solved_at,
         reward_amount = v_reward_amount
   where id = v_progress_id;

  return query select true, cardinality(v_guesses), v_reward_amount, v_balance, v_already_rewarded;
end;
$$;

revoke all on function public.record_fpldle_guess(date, text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_fpldle_guess(date, text, uuid, text, text, boolean)
  to service_role;

-- The payout row stores the calculated amount. Changing this function's
-- return shape requires a drop because PostgreSQL cannot replace OUT types.
drop function if exists public.pay_match_win(uuid, text, text, date, bigint);
create function public.pay_match_win(
  p_fixture uuid,
  p_user text,
  p_season text,
  p_week date,
  p_amount bigint
)
returns table(paid boolean, amount bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_amount bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  -- Lock before both the eligibility read and idempotency insert. This keeps
  -- concurrent payout workers from observing different wallet state.
  perform 1 from public.betting_profiles bp where bp.discord_id = p_user for update;
  if not found then raise exception 'unknown user %', p_user; end if;

  v_amount := public.calculate_recurring_reward(p_user, p_amount, 0, 1);
  insert into public.match_win_payouts(fixture_id, discord_id, season, week, amount)
    values (p_fixture, p_user, p_season, p_week, v_amount)
    on conflict (fixture_id, discord_id) do nothing
    returning id into v_id;
  if v_id is null then
    return query select false, 0::bigint;
    return;
  end if;

  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_user, v_amount, 'match_win', 'match_win_payouts', v_id);
  update public.betting_profiles bp
     set balance = bp.balance + v_amount
   where bp.discord_id = p_user;
  return query select true, v_amount;
end;
$$;

revoke all on function public.pay_match_win(uuid, text, text, date, bigint)
  from public, anon, authenticated;
grant execute on function public.pay_match_win(uuid, text, text, date, bigint)
  to service_role;
