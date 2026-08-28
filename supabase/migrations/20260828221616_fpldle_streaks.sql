-- FPL'dle streaks use an immutable solve marker. The current completion
-- marker remains an attempt-state field because admin resets clear it.
alter table public.fpldle_daily_progress
  add column if not exists first_solved_at timestamptz;

revoke all on table public.fpldle_daily_progress from public, anon, authenticated;
grant all on table public.fpldle_daily_progress to service_role;

-- Preserve completions made earlier on the current UTC puzzle day while this
-- feature is rolling out. Older days remain intentionally un-backfilled.
update public.fpldle_daily_progress
set first_solved_at = completed_at
where puzzle_date = (now() at time zone 'UTC')::date
  and completed_at is not null
  and first_solved_at is null;

create or replace function public.preserve_fpldle_first_solved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.first_solved_at is not null
     and new.first_solved_at is distinct from old.first_solved_at then
    new.first_solved_at := old.first_solved_at;
  end if;
  return new;
end;
$$;

drop trigger if exists fpldle_first_solved_at_immutable
  on public.fpldle_daily_progress;
create trigger fpldle_first_solved_at_immutable
before update on public.fpldle_daily_progress
for each row execute function public.preserve_fpldle_first_solved_at();

create index if not exists fpldle_daily_progress_solved_idx
  on public.fpldle_daily_progress (league, profile_id, puzzle_date desc)
  where first_solved_at is not null;

-- Replace the completion RPC after first_solved_at exists. completed_at still
-- tracks the current attempt and is intentionally resettable; first_solved_at
-- records the first successful solve for streak history.
create or replace function public.record_fpldle_guess(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text,
  p_player_slug text,
  p_is_correct boolean
) returns table(
  accepted         boolean,
  guess_count      integer,
  reward_amount    bigint,
  balance          bigint,
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

  select bp.balance
  into v_balance
  from public.betting_profiles bp
  where bp.discord_id = p_discord_id
    and bp.profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'FPLDLE_UNKNOWN_WALLET';
  end if;

  insert into public.fpldle_daily_progress (puzzle_date, league, profile_id, discord_id)
  values (p_puzzle_date, p_league, p_profile_id, p_discord_id)
  on conflict (puzzle_date, league, profile_id) do nothing;

  select progress.id, progress.guesses, progress.completed_at,
         progress.first_solved_at, progress.reward_amount
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
    if v_first_solved_at is null then
      v_first_solved_at := v_completed_at;
    end if;
    if v_reward_amount = 0 then
      insert into public.betting_ledger (discord_id, delta, reason, ref_table, ref_id)
      values (p_discord_id, 200, 'fpldle_completion', 'fpldle_daily_progress', v_progress_id);
      update public.betting_profiles
      set balance = public.betting_profiles.balance + 200
      where discord_id = p_discord_id;
      v_balance := v_balance + 200;
      v_reward_amount := 200;
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

create or replace function public.get_fpldle_streak_snapshot(
  p_league text,
  p_puzzle_date date,
  p_profile_id uuid
) returns table(
  profile_id uuid,
  username text,
  avatar_url text,
  current_streak integer,
  best_streak integer,
  rank integer,
  is_current_user boolean
)
language sql
security invoker
set search_path = public
as $$
  with solved_dates as (
    select distinct progress.profile_id, progress.puzzle_date
    from public.fpldle_daily_progress progress
    where progress.league = p_league
      and progress.puzzle_date <= p_puzzle_date
      and progress.first_solved_at is not null
  ),
  numbered_dates as (
    select
      solved.profile_id,
      solved.puzzle_date,
      solved.puzzle_date
        - row_number() over (
            partition by solved.profile_id
            order by solved.puzzle_date
          )::integer as island
    from solved_dates solved
  ),
  islands as (
    select
      numbered.profile_id,
      max(numbered.puzzle_date) as island_end,
      count(*)::integer as island_length
    from numbered_dates numbered
    group by numbered.profile_id, numbered.island
  ),
  history as (
    select
      island.profile_id,
      max(island.island_length)::integer as best_streak,
      max(island.island_end)::date as most_recent_solved_date,
      (max(island.island_length) filter (
        where island.island_end = p_puzzle_date
      ))::integer as solved_today_streak,
      (max(island.island_length) filter (
        where island.island_end = p_puzzle_date - 1
      ))::integer as solved_yesterday_streak
    from islands island
    group by island.profile_id
  ),
  today_progress as (
    select
      progress.profile_id,
      bool_or(
        progress.first_solved_at is null
        and cardinality(progress.guesses) >= 5
      ) as failed_today
    from public.fpldle_daily_progress progress
    where progress.league = p_league
      and progress.puzzle_date = p_puzzle_date
    group by progress.profile_id
  ),
  profile_ids as (
    select solved.profile_id from solved_dates solved
    union
    select today.profile_id from today_progress today
    union
    select p_profile_id where p_profile_id is not null
  ),
  stats as (
    select
      ids.profile_id,
      coalesce(
        case
          when coalesce(today.failed_today, false) then 0
          else coalesce(history.solved_today_streak, history.solved_yesterday_streak, 0)
        end,
        0
      )::integer as current_streak,
      coalesce(history.best_streak, 0)::integer as best_streak,
      history.most_recent_solved_date
    from profile_ids ids
    left join history on history.profile_id = ids.profile_id
    left join today_progress today on today.profile_id = ids.profile_id
  ),
  ranked as (
    select
      stats.*,
      row_number() over (
        order by
          stats.current_streak desc,
          stats.best_streak desc,
          stats.most_recent_solved_date desc nulls last,
          stats.profile_id
      )::integer as rank
    from stats
    where stats.current_streak > 0
  ),
  visible_rows as (
    select ranked.*
    from ranked
    where ranked.rank <= 5

    union all

    select ranked.*
    from ranked
    where ranked.profile_id = p_profile_id
      and ranked.rank > 5

    union all

    select
      stats.profile_id,
      stats.current_streak,
      stats.best_streak,
      stats.most_recent_solved_date,
      null::integer as rank
    from stats
    where stats.profile_id = p_profile_id
      and not exists (
        select 1
        from ranked
        where ranked.profile_id = p_profile_id
      )
  )
  select
    visible.profile_id,
    coalesce(betting.username, profile.display_name, 'Unknown') as username,
    coalesce(betting.avatar_url, profile.avatar_url) as avatar_url,
    visible.current_streak,
    visible.best_streak,
    visible.rank,
    visible.profile_id = p_profile_id as is_current_user
  from visible_rows visible
  left join public.betting_profiles betting
    on betting.profile_id = visible.profile_id
  left join public.profiles profile
    on profile.id = visible.profile_id
  order by visible.rank nulls last, visible.profile_id;
$$;

revoke all on function public.preserve_fpldle_first_solved_at() from public, anon, authenticated;
revoke all on function public.get_fpldle_streak_snapshot(text, date, uuid)
  from public, anon, authenticated;
grant execute on function public.get_fpldle_streak_snapshot(text, date, uuid)
  to service_role;
