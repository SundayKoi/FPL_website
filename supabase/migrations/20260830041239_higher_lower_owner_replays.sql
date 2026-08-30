-- Owners can replay completed runs while ordinary staff retain one run per
-- league and UTC date. Keep every owner attempt so the weekly leaderboard and
-- settlement still see the owner's best score.

alter table public.higher_lower_daily_runs
  add column if not exists owner_replay boolean not null default false;

alter table public.higher_lower_daily_runs
  drop constraint if exists higher_lower_daily_runs_puzzle_date_league_profile_id_key;

create unique index if not exists higher_lower_daily_runs_member_daily_idx
  on public.higher_lower_daily_runs (puzzle_date, league, profile_id)
  where owner_replay = false;

create or replace function public._start_higher_lower_run(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text,
  p_owner_replay boolean
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.higher_lower_daily_runs%rowtype;
  v_seed bigint;
  v_reference_slug text;
  v_reference_overall integer;
  v_challenger_slug text;
  v_attempt_number integer;
begin
  if p_league not in ('premier', 'academy')
     or p_profile_id is null
     or p_discord_id is null
     or p_owner_replay is null then
    raise exception 'HIGHER_LOWER_INVALID_RUN';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('higher-lower-run:' || p_puzzle_date::text || ':' || p_league || ':' || p_profile_id::text)
  );

  select * into v_run
  from public.higher_lower_daily_runs
  where puzzle_date = p_puzzle_date and league = p_league and profile_id = p_profile_id
  order by id desc
  limit 1
  for update;
  if found and (
    not p_owner_replay
    or v_run.run_state in ('not_started', 'awaiting_choice', 'correct_reveal')
  ) then
    return query select v_run.*;
    return;
  end if;

  select count(*)::integer
  into v_attempt_number
  from public.higher_lower_daily_runs
  where puzzle_date = p_puzzle_date and league = p_league and profile_id = p_profile_id;

  v_seed := hashtext(
    p_profile_id::text || ':' || p_puzzle_date::text || ':' || p_league || ':attempt:' || (v_attempt_number + 1)::text
  )::bigint;
  select candidate.player_slug, candidate.overall
  into v_reference_slug, v_reference_overall
  from public.higher_lower_daily_candidates candidate
  where candidate.puzzle_date = p_puzzle_date and candidate.league = p_league
  order by md5(v_seed::text || ':reference:' || candidate.player_slug)
  limit 1;
  if v_reference_slug is null then
    raise exception 'HIGHER_LOWER_NO_CANDIDATES';
  end if;

  v_challenger_slug := public._higher_lower_pick_challenger(
    p_puzzle_date, p_league, v_seed, 1, v_reference_slug, v_reference_overall,
    array[v_reference_slug]::text[], 0, 0
  );

  insert into public.higher_lower_daily_runs (
    puzzle_date, league, profile_id, discord_id, random_seed, run_state,
    run_score, reference_player_slug, challenger_player_slug, recent_player_history,
    round_number, run_version, round_expires_at, started_at, owner_replay
  ) values (
    p_puzzle_date, p_league, p_profile_id, p_discord_id, v_seed, 'awaiting_choice',
    0, v_reference_slug, v_challenger_slug, array[v_reference_slug]::text[],
    1, 1, now() + interval '20 seconds', now(), p_owner_replay
  ) returning * into v_run;

  return query select v_run.*;
end;
$$;

create or replace function public.start_higher_lower_run(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query select * from public._start_higher_lower_run(
    p_puzzle_date, p_league, p_profile_id, p_discord_id, false
  );
end;
$$;

create or replace function public.start_higher_lower_owner_run(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query select * from public._start_higher_lower_run(
    p_puzzle_date, p_league, p_profile_id, p_discord_id, true
  );
end;
$$;

-- Multiple owner attempts mean every mutation must operate on the latest
-- active row, while ordinary users still have at most one row to find.
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
    where id = v_run.id
    returning * into v_run;
    return query select v_run.*;
    return;
  end if;

  v_correct := (p_choice = 'higher' and v_challenger_overall > v_reference_overall)
    or (p_choice = 'lower' and v_challenger_overall < v_reference_overall);
  v_next_score := v_run.run_score + case when v_correct then 1 else 0 end;

  update public.higher_lower_daily_runs
  set run_state = case when v_correct and v_next_score = 30 then 'perfect'
                       when v_correct then 'correct_reveal' else 'lost' end,
      run_score = v_next_score,
      last_choice = p_choice,
      last_correct = v_correct,
      higher_answers = higher_answers + case when p_choice = 'higher' then 1 else 0 end,
      lower_answers = lower_answers + case when p_choice = 'lower' then 1 else 0 end,
      round_expires_at = null,
      completed_at = case when v_correct and v_next_score < 30 then null else now() end,
      completion_reason = case when not v_correct then 'incorrect'
                               when v_next_score = 30 then 'perfect' else null end,
      run_version = run_version + 1
  where id = v_run.id
  returning * into v_run;

  return query select v_run.*;
end;
$$;

create or replace function public.advance_higher_lower_round(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_run_version integer
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.higher_lower_daily_runs%rowtype;
  v_reference_overall integer;
  v_next_challenger text;
  v_next_history text[];
begin
  if p_league not in ('premier', 'academy') or p_profile_id is null or p_run_version is null then
    raise exception 'HIGHER_LOWER_INVALID_ADVANCE';
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
  if v_run.run_version <> p_run_version or v_run.run_state <> 'correct_reveal' then
    return query select v_run.*;
    return;
  end if;

  select candidate.overall into v_reference_overall
  from public.higher_lower_daily_candidates candidate
  where candidate.puzzle_date = p_puzzle_date and candidate.league = p_league
    and candidate.player_slug = v_run.challenger_player_slug;
  if v_reference_overall is null then
    raise exception 'HIGHER_LOWER_SNAPSHOT_UNAVAILABLE';
  end if;

  v_next_history := array_append(v_run.recent_player_history, v_run.challenger_player_slug);
  v_next_challenger := public._higher_lower_pick_challenger(
    p_puzzle_date, p_league, v_run.random_seed, v_run.round_number + 1,
    v_run.challenger_player_slug, v_reference_overall, v_next_history,
    v_run.higher_answers, v_run.lower_answers
  );

  update public.higher_lower_daily_runs
  set run_state = 'awaiting_choice',
      reference_player_slug = challenger_player_slug,
      challenger_player_slug = v_next_challenger,
      recent_player_history = v_next_history,
      round_number = round_number + 1,
      round_expires_at = now() + interval '20 seconds',
      run_version = run_version + 1
  where id = v_run.id
  returning * into v_run;

  return query select v_run.*;
end;
$$;

revoke all on function public._start_higher_lower_run(date, text, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public._start_higher_lower_run(date, text, uuid, text, boolean)
  to service_role;
revoke all on function public.start_higher_lower_owner_run(date, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_higher_lower_owner_run(date, text, uuid, text)
  to service_role;
