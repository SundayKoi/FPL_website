-- One daily-game reward is shared by FPL'dle and Higher or Lower. The claim
-- is keyed by UTC date and profile, so completing either game first pays once.

create table public.daily_game_rewards (
  id             bigint generated always as identity primary key,
  puzzle_date    date not null,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  discord_id     text not null references public.betting_profiles(discord_id) on delete cascade,
  source         text not null check (source in ('fpldle', 'higher_lower')),
  source_id      bigint,
  reward_amount  bigint not null check (reward_amount > 0),
  created_at     timestamptz not null default now(),
  unique (puzzle_date, profile_id)
);

create index daily_game_rewards_profile_date_idx
  on public.daily_game_rewards (profile_id, puzzle_date desc);

alter table public.daily_game_rewards enable row level security;
revoke all on table public.daily_game_rewards from anon, authenticated;
grant all on table public.daily_game_rewards to service_role;
grant usage, select on sequence public.daily_game_rewards_id_seq to service_role;

-- The wallet lock serializes different daily games for the same member while
-- the unique claim row prevents a second ledger credit for that UTC date.
create or replace function public.claim_daily_game_reward(
  p_puzzle_date date,
  p_profile_id uuid,
  p_discord_id text,
  p_source text,
  p_source_id bigint
) returns table(amount bigint, balance bigint, already_claimed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward_id bigint;
  v_reward_amount bigint;
  v_balance bigint;
  v_already_claimed boolean := false;
begin
  if p_puzzle_date is null or p_profile_id is null or p_discord_id is null
     or p_source not in ('fpldle', 'higher_lower') then
    raise exception 'DAILY_GAME_REWARD_INVALID_CLAIM';
  end if;

  select bp.balance
    into v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     and bp.profile_id = p_profile_id
     for update;
  if not found then raise exception 'DAILY_GAME_REWARD_UNKNOWN_WALLET'; end if;

  v_reward_amount := public.calculate_recurring_reward(p_discord_id, 200, 0, 1);

  insert into public.daily_game_rewards(
    puzzle_date, profile_id, discord_id, source, source_id, reward_amount
  ) values (
    p_puzzle_date, p_profile_id, p_discord_id, p_source, p_source_id, v_reward_amount
  )
  on conflict (puzzle_date, profile_id) do nothing
  returning id, reward_amount into v_reward_id, v_reward_amount;

  if v_reward_id is null then
    select reward.reward_amount
      into v_reward_amount
      from public.daily_game_rewards reward
     where reward.puzzle_date = p_puzzle_date
       and reward.profile_id = p_profile_id;
    v_already_claimed := true;
    return query select v_reward_amount, v_balance, v_already_claimed;
    return;
  end if;

  insert into public.betting_ledger(discord_id, delta, reason, ref_table, ref_id)
    values (p_discord_id, v_reward_amount, 'daily_game_reward', 'daily_game_rewards', v_reward_id);
  update public.betting_profiles bp
     set balance = bp.balance + v_reward_amount
   where bp.discord_id = p_discord_id
   returning bp.balance into v_balance;

  return query select v_reward_amount, v_balance, v_already_claimed;
end;
$$;

revoke all on function public.claim_daily_game_reward(date, uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.claim_daily_game_reward(date, uuid, text, text, bigint)
  to service_role;

-- Higher or Lower records the shared reward on the completed attempt so the
-- server can explain whether this run claimed it or found an earlier claim.
alter table public.higher_lower_daily_runs
  add column if not exists reward_amount bigint not null default 0
    check (reward_amount >= 0),
  add column if not exists reward_already_claimed boolean not null default false;

-- FPL'dle keeps its per-league progress, but the payout is now shared across
-- both daily games for the member and UTC date.
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
      select claim.amount, claim.balance, claim.already_claimed
        into v_reward_amount, v_balance, v_already_rewarded
        from public.claim_daily_game_reward(
          p_puzzle_date, p_profile_id, p_discord_id, 'fpldle', v_progress_id
        ) claim;
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

-- A timeout, incorrect choice, or perfect 45-round run completes Higher or
-- Lower and claims the same shared reward. The latest-attempt behavior from
-- the owner-replay migration remains intact.
create or replace function public.submit_higher_lower_choice(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_run_version integer,
  p_choice text
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.higher_lower_daily_runs%rowtype;
  v_reference_overall integer;
  v_challenger_overall integer;
  v_correct boolean;
  v_next_score integer;
  v_reward_amount bigint;
  v_reward_already_claimed boolean;
begin
  if p_league not in ('premier', 'academy')
     or p_profile_id is null
     or p_run_version is null
     or p_choice is null
     or p_choice not in ('higher', 'lower', 'timeout') then
    raise exception 'HIGHER_LOWER_INVALID_CHOICE';
  end if;

  select * into v_run
  from public.higher_lower_daily_runs
  where puzzle_date = p_puzzle_date and league = p_league and profile_id = p_profile_id
  order by id desc
  limit 1
  for update;
  if not found then
    raise exception 'HIGHER_LOWER_RUN_NOT_FOUND';
  end if;
  if v_run.run_version <> p_run_version or v_run.run_state <> 'awaiting_choice' then
    return query select v_run.*;
    return;
  end if;

  select candidate.overall into v_reference_overall
  from public.higher_lower_daily_candidates candidate
  where candidate.puzzle_date = p_puzzle_date and candidate.league = p_league
    and candidate.player_slug = v_run.reference_player_slug;
  select candidate.overall into v_challenger_overall
  from public.higher_lower_daily_candidates candidate
  where candidate.puzzle_date = p_puzzle_date and candidate.league = p_league
    and candidate.player_slug = v_run.challenger_player_slug;
  if v_reference_overall is null or v_challenger_overall is null then
    raise exception 'HIGHER_LOWER_SNAPSHOT_UNAVAILABLE';
  end if;

  if p_choice = 'timeout' or now() >= v_run.round_expires_at then
    update public.higher_lower_daily_runs
    set run_state = 'lost', last_choice = 'timeout', last_correct = false,
        round_expires_at = null, completed_at = now(), completion_reason = 'timeout',
        run_version = run_version + 1
    where id = v_run.id;

    select claim.amount, claim.already_claimed
      into v_reward_amount, v_reward_already_claimed
      from public.claim_daily_game_reward(
        p_puzzle_date, p_profile_id, v_run.discord_id, 'higher_lower', v_run.id
      ) claim;
    update public.higher_lower_daily_runs
    set reward_amount = v_reward_amount,
        reward_already_claimed = v_reward_already_claimed
    where id = v_run.id
    returning * into v_run;
    return query select v_run.*;
    return;
  end if;

  v_correct := (p_choice = 'higher' and v_challenger_overall > v_reference_overall)
    or (p_choice = 'lower' and v_challenger_overall < v_reference_overall);
  v_next_score := v_run.run_score + case when v_correct then 1 else 0 end;

  update public.higher_lower_daily_runs
  set run_state = case when v_correct and v_next_score = 45 then 'perfect'
                       when v_correct then 'correct_reveal' else 'lost' end,
      run_score = v_next_score,
      last_choice = p_choice,
      last_correct = v_correct,
      higher_answers = higher_answers + case when p_choice = 'higher' then 1 else 0 end,
      lower_answers = lower_answers + case when p_choice = 'lower' then 1 else 0 end,
      round_expires_at = null,
      completed_at = case when v_correct and v_next_score < 45 then null else now() end,
      completion_reason = case when not v_correct then 'incorrect'
                               when v_next_score = 45 then 'perfect' else null end,
      run_version = run_version + 1
  where id = v_run.id
  returning * into v_run;

  if v_run.run_state in ('lost', 'perfect') then
    select claim.amount, claim.already_claimed
      into v_reward_amount, v_reward_already_claimed
      from public.claim_daily_game_reward(
        p_puzzle_date, p_profile_id, v_run.discord_id, 'higher_lower', v_run.id
      ) claim;
    update public.higher_lower_daily_runs
    set reward_amount = v_reward_amount,
        reward_already_claimed = v_reward_already_claimed
    where id = v_run.id
    returning * into v_run;
  end if;

  return query select v_run.*;
end;
$$;

revoke all on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  to service_role;
