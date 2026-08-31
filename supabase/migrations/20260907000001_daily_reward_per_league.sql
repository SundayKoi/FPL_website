-- The Academy puzzle pays its own reward.
--
-- daily_game_rewards was unique on (puzzle_date, profile_id), with no league
-- dimension — but FPL'dle, Higher or Lower and Guess the Card all run a
-- SEPARATE premier and academy puzzle, and the UI presents them as two
-- games. Solving Academy after Premier paid nothing and said nothing, which
-- reads as a bug however it is explained.
--
-- ECONOMY NOTE, deliberately loud: this DOUBLES the daily-game faucet for
-- anyone who plays both leagues — $400/day, $600 for a patron, up from
-- $200/$300. The three games still share one reward WITHIN a league; what
-- changes is that the two leagues no longer share one with each other. If
-- that is too much, the lever is the 200 in calculate_recurring_reward
-- below, not this key.

alter table public.daily_game_rewards
  add column if not exists league text not null default 'premier'
    check (league in ('premier', 'academy'));

-- Existing rows are all premier by construction (the column defaulted), so
-- the widened key can be swapped in without touching history.
alter table public.daily_game_rewards
  drop constraint if exists daily_game_rewards_puzzle_date_profile_id_key;

create unique index if not exists daily_game_rewards_day_profile_league
  on public.daily_game_rewards (puzzle_date, profile_id, league);

-- The claim, keyed per league. The sixth parameter DEFAULTS to premier so
-- any caller not yet passing one keeps its old behaviour rather than
-- failing to resolve; every caller in this migration passes it explicitly.
drop function if exists public.claim_daily_game_reward(date, uuid, text, text, bigint);

create or replace function public.claim_daily_game_reward(
  p_puzzle_date date,
  p_profile_id uuid,
  p_discord_id text,
  p_source text,
  p_source_id bigint,
  p_league text default 'premier'
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
     or p_source not in ('fpldle', 'higher_lower', 'box_score')
     or p_league not in ('premier', 'academy') then
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
    puzzle_date, profile_id, discord_id, source, source_id, reward_amount, league
  ) values (
    p_puzzle_date, p_profile_id, p_discord_id, p_source, p_source_id, v_reward_amount, p_league
  )
  on conflict (puzzle_date, profile_id, league) do nothing
  returning id, reward_amount into v_reward_id, v_reward_amount;

  if v_reward_id is null then
    select reward.reward_amount
      into v_reward_amount
      from public.daily_game_rewards reward
     where reward.puzzle_date = p_puzzle_date
       and reward.profile_id = p_profile_id
       and reward.league = p_league;
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

revoke all on function public.claim_daily_game_reward(date, uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.claim_daily_game_reward(date, uuid, text, text, bigint, text)
  to service_role;

-- The three callers, republished unchanged except for the league they now
-- hand the claim. Each already had p_league in scope; a diff against the
-- migration that defined them shows only the argument list moving.
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
          p_puzzle_date, p_profile_id, p_discord_id, 'fpldle', v_progress_id, p_league
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
        p_puzzle_date, p_profile_id, v_run.discord_id, 'higher_lower', v_run.id, p_league
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
        p_puzzle_date, p_profile_id, v_run.discord_id, 'higher_lower', v_run.id, p_league
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

create or replace function public.record_box_score_guess(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text,
  p_player_slug text
) returns table(
  accepted          boolean,
  correct           boolean,
  guess_count       integer,
  status            text,
  reward_amount     bigint,
  balance           bigint,
  already_rewarded  boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_answer_slug text;
  v_progress_id bigint;
  v_guesses text[];
  v_status text;
  v_completed_at timestamptz;
  v_reward_amount bigint := 0;
  v_balance bigint;
  v_already_rewarded boolean := false;
  v_correct boolean;
begin
  if p_league not in ('premier', 'academy')
     or p_profile_id is null
     or p_discord_id is null
     or p_player_slug is null
     or p_player_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'BOX_SCORE_INVALID_GUESS';
  end if;

  select puzzle.answer_slug
    into v_answer_slug
    from public.box_score_daily_puzzles puzzle
   where puzzle.puzzle_date = p_puzzle_date
     and puzzle.league = p_league;
  if not found then raise exception 'BOX_SCORE_PUZZLE_UNAVAILABLE'; end if;

  if not exists (
    select 1 from public.box_score_daily_candidates candidate
     where candidate.puzzle_date = p_puzzle_date
       and candidate.league = p_league
       and candidate.player_slug = p_player_slug
  ) then
    raise exception 'BOX_SCORE_UNKNOWN_PLAYER';
  end if;

  select bp.balance
    into v_balance
    from public.betting_profiles bp
   where bp.discord_id = p_discord_id
     and bp.profile_id = p_profile_id
   for update;
  if not found then raise exception 'BOX_SCORE_UNKNOWN_WALLET'; end if;

  insert into public.box_score_daily_progress(puzzle_date, league, profile_id, discord_id)
  values (p_puzzle_date, p_league, p_profile_id, p_discord_id)
  on conflict (puzzle_date, league, profile_id) do nothing;

  select progress.id,
         progress.guesses,
         progress.status,
         progress.completed_at,
         progress.reward_amount,
         progress.reward_already_claimed
    into v_progress_id,
         v_guesses,
         v_status,
         v_completed_at,
         v_reward_amount,
         v_already_rewarded
    from public.box_score_daily_progress progress
   where progress.puzzle_date = p_puzzle_date
     and progress.league = p_league
     and progress.profile_id = p_profile_id
   for update;

  if p_player_slug = any(v_guesses) then
    raise exception 'BOX_SCORE_DUPLICATE_GUESS';
  end if;
  if v_status <> 'playing' or cardinality(v_guesses) >= 5 then
    raise exception 'BOX_SCORE_GAME_COMPLETE';
  end if;

  v_guesses := array_append(v_guesses, p_player_slug);
  v_correct := p_player_slug = v_answer_slug;
  if v_correct then
    v_status := 'won';
    v_completed_at := now();
    select claim.amount, claim.balance, claim.already_claimed
      into v_reward_amount, v_balance, v_already_rewarded
      from public.claim_daily_game_reward(
        p_puzzle_date, p_profile_id, p_discord_id, 'box_score', v_progress_id, p_league
      ) claim;
  elsif cardinality(v_guesses) >= 5 then
    v_status := 'lost';
    v_completed_at := now();
  end if;

  update public.box_score_daily_progress
     set guesses = v_guesses,
         status = v_status,
         completed_at = v_completed_at,
         reward_amount = v_reward_amount,
         reward_already_claimed = v_already_rewarded
   where id = v_progress_id;

  return query select true,
                      v_correct,
                      cardinality(v_guesses),
                      v_status,
                      v_reward_amount,
                      v_balance,
                      v_already_rewarded;
end;
$$;
