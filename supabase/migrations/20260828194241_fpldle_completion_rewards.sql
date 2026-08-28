-- Reward signed-in FPL'dle players once per UTC puzzle and league after a
-- correct guess. Progress is private: the service-role RPC records attempts,
-- while the app remains responsible for comparing the hidden answer.

create table if not exists public.fpldle_daily_progress (
  id             bigint generated always as identity primary key,
  puzzle_date    date not null,
  league         text not null check (league in ('premier', 'academy')),
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  discord_id     text not null references public.betting_profiles(discord_id) on delete cascade,
  guesses        text[] not null default '{}'::text[],
  completed_at   timestamptz,
  reward_amount  bigint not null default 0 check (reward_amount >= 0),
  created_at     timestamptz not null default now(),
  unique (puzzle_date, league, profile_id),
  constraint fpldle_daily_progress_max_guesses check (cardinality(guesses) <= 5)
);

create index if not exists fpldle_daily_progress_user_idx
  on public.fpldle_daily_progress (discord_id, puzzle_date desc);

alter table public.fpldle_daily_progress enable row level security;
revoke all on table public.fpldle_daily_progress from anon, authenticated;
grant all on table public.fpldle_daily_progress to service_role;

-- The amount is fixed in the database so a client cannot choose its own
-- payout. The progress row and ledger/balance update share one transaction.
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

  select progress.id, progress.guesses, progress.completed_at, progress.reward_amount
  into v_progress_id, v_guesses, v_completed_at, v_reward_amount
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
      reward_amount = v_reward_amount
  where id = v_progress_id;

  return query select true, cardinality(v_guesses), v_reward_amount, v_balance, v_already_rewarded;
end;
$$;

revoke all on function public.record_fpldle_guess(date, text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_fpldle_guess(date, text, uuid, text, text, boolean)
  to service_role;

-- Admin testing resets the attempt list but preserves a reward already paid
-- for this UTC puzzle, preventing repeated credits after a reset.
create or replace function public.reset_fpldle_daily_puzzle(
  p_puzzle_date date,
  p_league text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'FPLDLE_INVALID_LEAGUE';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('fpldle:' || p_puzzle_date::text || ':' || p_league)
  );

  update public.fpldle_daily_progress
  set guesses = '{}'::text[], completed_at = null
  where puzzle_date = p_puzzle_date
    and league = p_league;

  delete from public.fpldle_daily_puzzles
  where puzzle_date = p_puzzle_date
    and league = p_league;

  delete from public.fpldle_daily_candidates
  where puzzle_date = p_puzzle_date
    and league = p_league;
end;
$$;

revoke all on function public.reset_fpldle_daily_puzzle(date, text)
  from public, anon, authenticated;
grant execute on function public.reset_fpldle_daily_puzzle(date, text)
  to service_role;
