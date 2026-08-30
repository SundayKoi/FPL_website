-- Extend Higher or Lower to 45 choices. Rounds 26-45 keep the existing
-- closest-match difficulty band; only the run length and its limits change.

alter table public.higher_lower_daily_runs
  drop constraint if exists higher_lower_daily_runs_run_score_check,
  drop constraint if exists higher_lower_daily_runs_round_number_check;

alter table public.higher_lower_daily_runs
  add constraint higher_lower_daily_runs_run_score_check check (run_score between 0 and 45),
  add constraint higher_lower_daily_runs_round_number_check check (round_number between 0 and 45);

alter table public.higher_lower_weekly_settlements
  drop constraint if exists higher_lower_weekly_settlements_top_score_check;

alter table public.higher_lower_weekly_settlements
  add constraint higher_lower_weekly_settlements_top_score_check check (top_score between 0 and 45);

alter table public.higher_lower_weekly_payouts
  drop constraint if exists higher_lower_weekly_payouts_winning_score_check;

alter table public.higher_lower_weekly_payouts
  add constraint higher_lower_weekly_payouts_winning_score_check check (winning_score between 0 and 45);

create or replace function public._higher_lower_pick_challenger(
  p_puzzle_date date,
  p_league text,
  p_seed bigint,
  p_round integer,
  p_reference_slug text,
  p_reference_overall integer,
  p_history text[],
  p_higher_answers integer,
  p_lower_answers integer
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_min_gap integer;
  v_max_gap integer;
  v_expand integer;
  v_higher_count integer;
  v_lower_count integer;
  v_direction text;
  v_slug text;
  v_fallback boolean;
  v_history text[] := coalesce(p_history, '{}'::text[]);
begin
  if p_round between 1 and 5 then
    v_min_gap := 30; v_max_gap := 99;
  elsif p_round between 6 and 10 then
    v_min_gap := 21; v_max_gap := 30;
  elsif p_round between 11 and 15 then
    v_min_gap := 15; v_max_gap := 22;
  elsif p_round between 16 and 20 then
    v_min_gap := 10; v_max_gap := 16;
  elsif p_round between 21 and 25 then
    v_min_gap := 7; v_max_gap := 12;
  elsif p_round between 26 and 45 then
    v_min_gap := 4; v_max_gap := 9;
  else
    raise exception 'HIGHER_LOWER_INVALID_ROUND';
  end if;

  for v_expand in 0..99 loop
    select
      count(*) filter (where candidate.overall > p_reference_overall),
      count(*) filter (where candidate.overall < p_reference_overall)
    into v_higher_count, v_lower_count
    from public.higher_lower_daily_candidates candidate
    where candidate.puzzle_date = p_puzzle_date
      and candidate.league = p_league
      and candidate.player_slug <> p_reference_slug
      and candidate.overall <> p_reference_overall
      and abs(candidate.overall - p_reference_overall)
        between greatest(1, v_min_gap - v_expand) and least(99, v_max_gap + v_expand)
      and candidate.player_slug <> all(
        v_history[greatest(1, cardinality(v_history) - 4):cardinality(v_history)]
      );

    v_fallback := coalesce(v_higher_count, 0) = 0 and coalesce(v_lower_count, 0) = 0;
    if v_fallback then
      select
        count(*) filter (where candidate.overall > p_reference_overall),
        count(*) filter (where candidate.overall < p_reference_overall)
      into v_higher_count, v_lower_count
      from public.higher_lower_daily_candidates candidate
      where candidate.puzzle_date = p_puzzle_date
        and candidate.league = p_league
        and candidate.player_slug <> p_reference_slug
        and candidate.overall <> p_reference_overall
        and abs(candidate.overall - p_reference_overall)
          between greatest(1, v_min_gap - v_expand) and least(99, v_max_gap + v_expand);
      if coalesce(v_higher_count, 0) = 0 and coalesce(v_lower_count, 0) = 0 then
        continue;
      end if;
    end if;

    if v_higher_count = 0 then
      v_direction := 'lower';
    elsif v_lower_count = 0 then
      v_direction := 'higher';
    elsif p_higher_answers < p_lower_answers then
      v_direction := 'higher';
    elsif p_lower_answers < p_higher_answers then
      v_direction := 'lower';
    elsif (hashtext(p_seed::text || ':' || p_round::text)::bigint % 2) = 0 then
      v_direction := 'higher';
    else
      v_direction := 'lower';
    end if;

    if not v_fallback then
      select candidate.player_slug
      into v_slug
      from public.higher_lower_daily_candidates candidate
      where candidate.puzzle_date = p_puzzle_date
        and candidate.league = p_league
        and candidate.player_slug <> p_reference_slug
        and candidate.overall <> p_reference_overall
        and abs(candidate.overall - p_reference_overall)
          between greatest(1, v_min_gap - v_expand) and least(99, v_max_gap + v_expand)
        and ((v_direction = 'higher' and candidate.overall > p_reference_overall)
          or (v_direction = 'lower' and candidate.overall < p_reference_overall))
        and candidate.player_slug <> all(
          v_history[greatest(1, cardinality(v_history) - 4):cardinality(v_history)]
        )
      order by md5(p_seed::text || ':' || p_round::text || ':' || candidate.player_slug)
      limit 1;
      if v_slug is not null then
        return v_slug;
      end if;
    end if;

    -- Cooldown is a preference, not a dead end. The first five-card repeat
    -- permitted by the fallback is the oldest recent appearance in-band.
    select candidate.player_slug
    into v_slug
    from public.higher_lower_daily_candidates candidate
    where candidate.puzzle_date = p_puzzle_date
      and candidate.league = p_league
      and candidate.player_slug <> p_reference_slug
      and candidate.overall <> p_reference_overall
      and abs(candidate.overall - p_reference_overall)
        between greatest(1, v_min_gap - v_expand) and least(99, v_max_gap + v_expand)
      and ((v_direction = 'higher' and candidate.overall > p_reference_overall)
        or (v_direction = 'lower' and candidate.overall < p_reference_overall))
    order by array_position(v_history, candidate.player_slug) nulls last,
      md5(p_seed::text || ':' || p_round::text || ':' || candidate.player_slug)
    limit 1;
    if v_slug is not null then
      return v_slug;
    end if;
  end loop;

  raise exception 'HIGHER_LOWER_NO_CANDIDATES';
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

  return query select v_run.*;
end;
$$;

revoke all on function public._higher_lower_pick_challenger(date, text, bigint, integer, text, integer, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public._higher_lower_pick_challenger(date, text, bigint, integer, text, integer, text[], integer, integer)
  to service_role;
revoke all on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  to service_role;
