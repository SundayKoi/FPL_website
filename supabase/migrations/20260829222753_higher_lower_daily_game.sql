-- Higher or Lower freezes one card-edition pool per UTC date and league, then
-- runs every member's private sequence from that immutable snapshot. All
-- rows and mutating functions are service-role-only: the browser receives
-- deliberately shaped DTOs from the Next.js server module.

create table public.higher_lower_daily_candidates (
  puzzle_date  date not null,
  league       text not null check (league in ('premier', 'academy')),
  season       text not null,
  edition_week date not null,
  player_slug  text not null,
  player_name  text not null,
  overall      integer not null check (overall between 1 and 99),
  card         jsonb not null,
  snapshot_at  timestamptz not null default now(),
  primary key (puzzle_date, league, player_slug)
);

create index higher_lower_candidates_lookup_idx
  on public.higher_lower_daily_candidates (puzzle_date, league, overall);

create table public.higher_lower_daily_runs (
  id                    bigint generated always as identity primary key,
  puzzle_date           date not null,
  league                text not null check (league in ('premier', 'academy')),
  profile_id            uuid not null references public.profiles(id) on delete cascade,
  discord_id            text not null references public.betting_profiles(discord_id) on delete cascade,
  random_seed           bigint not null,
  run_state             text not null default 'not_started'
    check (run_state in ('not_started', 'awaiting_choice', 'correct_reveal', 'lost', 'perfect')),
  run_score             integer not null default 0 check (run_score between 0 and 30),
  reference_player_slug text,
  challenger_player_slug text,
  recent_player_history text[] not null default '{}'::text[],
  round_number          integer not null default 0 check (round_number between 0 and 30),
  run_version           integer not null default 0 check (run_version >= 0),
  higher_answers        integer not null default 0 check (higher_answers >= 0),
  lower_answers         integer not null default 0 check (lower_answers >= 0),
  last_choice           text check (last_choice in ('higher', 'lower', 'timeout')),
  last_correct          boolean,
  round_expires_at      timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  completion_reason     text check (completion_reason in ('incorrect', 'timeout', 'perfect')),
  created_at            timestamptz not null default now(),
  unique (puzzle_date, league, profile_id)
);

create index higher_lower_runs_leaderboard_idx
  on public.higher_lower_daily_runs (puzzle_date, league, run_score desc);
create index higher_lower_runs_profile_idx
  on public.higher_lower_daily_runs (profile_id, puzzle_date desc);

create table public.higher_lower_weekly_settlements (
  id             bigint generated always as identity primary key,
  week_start     date not null unique,
  top_score      integer not null check (top_score between 0 and 30),
  prize_pool     bigint not null check (prize_pool >= 0),
  winner_count   integer not null check (winner_count >= 0),
  settled_at     timestamptz,
  status         text not null check (status in ('settled')),
  created_at     timestamptz not null default now()
);

create table public.higher_lower_weekly_payouts (
  id             bigint generated always as identity primary key,
  settlement_id  bigint not null references public.higher_lower_weekly_settlements(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id) on delete cascade,
  discord_id     text not null references public.betting_profiles(discord_id) on delete cascade,
  winning_score  integer not null check (winning_score between 0 and 30),
  award_amount   bigint not null check (award_amount > 0),
  ledger_reference bigint,
  created_at     timestamptz not null default now(),
  unique (settlement_id, profile_id)
);

alter table public.higher_lower_daily_candidates enable row level security;
alter table public.higher_lower_daily_runs enable row level security;
alter table public.higher_lower_weekly_settlements enable row level security;
alter table public.higher_lower_weekly_payouts enable row level security;

revoke all on table public.higher_lower_daily_candidates from anon, authenticated;
revoke all on table public.higher_lower_daily_runs from anon, authenticated;
revoke all on table public.higher_lower_weekly_settlements from anon, authenticated;
revoke all on table public.higher_lower_weekly_payouts from anon, authenticated;
grant all on table public.higher_lower_daily_candidates to service_role;
grant all on table public.higher_lower_daily_runs to service_role;
grant all on table public.higher_lower_weekly_settlements to service_role;
grant all on table public.higher_lower_weekly_payouts to service_role;
grant usage, select on sequence public.higher_lower_daily_runs_id_seq to service_role;
grant usage, select on sequence public.higher_lower_weekly_settlements_id_seq to service_role;
grant usage, select on sequence public.higher_lower_weekly_payouts_id_seq to service_role;

-- The pool is frozen once. Re-running this function for the same date and
-- league never refreshes card JSON after a weekly archive changes.
create or replace function public.ensure_higher_lower_daily_candidates(
  p_puzzle_date date,
  p_league text,
  p_season text,
  p_edition_week date
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'HIGHER_LOWER_INVALID_LEAGUE';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('higher-lower-candidates:' || p_puzzle_date::text || ':' || p_league)
  );

  select count(*)::integer
  into v_count
  from public.higher_lower_daily_candidates
  where puzzle_date = p_puzzle_date and league = p_league;
  if v_count > 0 then
    return v_count;
  end if;

  insert into public.higher_lower_daily_candidates (
    puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
  )
  select
    p_puzzle_date,
    p_league,
    p_season,
    p_edition_week,
    edition.slug,
    edition.player_name,
    edition.overall,
    edition.card
  from public.card_editions edition
  where edition.season = p_season
    and edition.edition_week = p_edition_week
    and edition.overall between 1 and 99
    and jsonb_typeof(edition.card) = 'object'
  on conflict (puzzle_date, league, player_slug) do nothing;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    select count(*)::integer
    into v_count
    from public.higher_lower_daily_candidates
    where puzzle_date = p_puzzle_date and league = p_league;
  end if;
  return v_count;
end;
$$;

-- Stable candidate selector. md5 gives deterministic ordering for a private
-- seed and round; no per-request random() call can reshuffle a member's run.
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
  elsif p_round between 26 and 30 then
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
declare
  v_run public.higher_lower_daily_runs%rowtype;
  v_seed bigint;
  v_reference_slug text;
  v_reference_overall integer;
  v_challenger_slug text;
begin
  if p_league not in ('premier', 'academy') or p_profile_id is null or p_discord_id is null then
    raise exception 'HIGHER_LOWER_INVALID_RUN';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('higher-lower-run:' || p_puzzle_date::text || ':' || p_league || ':' || p_profile_id::text)
  );

  select * into v_run
  from public.higher_lower_daily_runs
  where puzzle_date = p_puzzle_date and league = p_league and profile_id = p_profile_id
  for update;
  if found then
    return query select v_run.*;
    return;
  end if;

  v_seed := hashtext(p_profile_id::text || ':' || p_puzzle_date::text || ':' || p_league)::bigint;
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
    round_number, run_version, round_expires_at, started_at
  ) values (
    p_puzzle_date, p_league, p_profile_id, p_discord_id, v_seed, 'awaiting_choice',
    0, v_reference_slug, v_challenger_slug, array[v_reference_slug]::text[],
    1, 1, now() + interval '20 seconds', now()
  ) returning * into v_run;

  return query select v_run.*;
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

create or replace function public.settle_higher_lower_week(
  p_week_start date
) returns table(
  week_start date,
  top_score integer,
  prize_pool bigint,
  winner_count integer,
  settled_at timestamptz,
  status text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settlement public.higher_lower_weekly_settlements%rowtype;
  v_top_score integer;
  v_winner_count integer;
  v_prize_pool bigint := 2000;
  v_payout_id bigint;
  v_ledger_id bigint;
  v_winner record;
  v_award bigint;
begin
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'HIGHER_LOWER_INVALID_WEEK';
  end if;

  perform pg_advisory_xact_lock(hashtext('higher-lower-settlement:' || p_week_start::text));

  select settlement.* into v_settlement
  from public.higher_lower_weekly_settlements as settlement
  where settlement.week_start = p_week_start;
  if found then
    return query select v_settlement.week_start, v_settlement.top_score,
      v_settlement.prize_pool, v_settlement.winner_count,
      v_settlement.settled_at, v_settlement.status;
    return;
  end if;

  select coalesce(max(best.run_score), 0)::integer
  into v_top_score
  from (
    select profile_id, max(run_score) as run_score
    from public.higher_lower_daily_runs
    where puzzle_date >= p_week_start and puzzle_date < p_week_start + 7
    group by profile_id
  ) best;

  select count(*)::integer
  into v_winner_count
  from (
    select best.profile_id, max(best.run_score) as run_score
    from (
      select profile_id, max(run_score) as run_score
      from public.higher_lower_daily_runs
      where puzzle_date >= p_week_start and puzzle_date < p_week_start + 7
      group by profile_id
    ) best
    join public.betting_profiles wallet on wallet.profile_id = best.profile_id
    group by best.profile_id
    having max(best.run_score) = v_top_score
  ) winners;

  insert into public.higher_lower_weekly_settlements (
    week_start, top_score, prize_pool, winner_count, settled_at, status
  ) values (p_week_start, v_top_score, v_prize_pool, v_winner_count, now(), 'settled')
  returning * into v_settlement;

  if v_winner_count > 0 then
    for v_winner in
      select best.profile_id, wallet.discord_id, best.run_score,
        row_number() over (
          order by md5(p_week_start::text || ':' || best.profile_id::text), best.profile_id
        ) as winner_rank
      from (
        select profile_id, max(run_score) as run_score
        from public.higher_lower_daily_runs
        where puzzle_date >= p_week_start and puzzle_date < p_week_start + 7
        group by profile_id
      ) best
      join public.betting_profiles wallet on wallet.profile_id = best.profile_id
      where best.run_score = v_top_score
      order by best.profile_id
    loop
      v_award := (v_prize_pool / v_winner_count)
        + case when v_winner.winner_rank <= (v_prize_pool % v_winner_count) then 1 else 0 end;
      insert into public.higher_lower_weekly_payouts (
        settlement_id, profile_id, discord_id, winning_score, award_amount
      ) values (
        v_settlement.id, v_winner.profile_id, v_winner.discord_id,
        v_winner.run_score, v_award
      ) returning id into v_payout_id;

      insert into public.betting_ledger (discord_id, delta, reason, ref_table, ref_id)
      values (v_winner.discord_id, v_award, 'higher_lower_weekly', 'higher_lower_weekly_payouts', v_payout_id)
      returning id into v_ledger_id;

      update public.betting_profiles
      set balance = balance + v_award
      where discord_id = v_winner.discord_id;
      update public.higher_lower_weekly_payouts
      set ledger_reference = v_ledger_id
      where id = v_payout_id;
    end loop;
  end if;

  return query select v_settlement.week_start, v_settlement.top_score,
    v_settlement.prize_pool, v_settlement.winner_count,
    v_settlement.settled_at, v_settlement.status;
end;
$$;

revoke all on function public.ensure_higher_lower_daily_candidates(date, text, text, date)
  from public, anon, authenticated;
grant execute on function public.ensure_higher_lower_daily_candidates(date, text, text, date)
  to service_role;
revoke all on function public._higher_lower_pick_challenger(date, text, bigint, integer, text, integer, text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public._higher_lower_pick_challenger(date, text, bigint, integer, text, integer, text[], integer, integer)
  to service_role;
revoke all on function public.start_higher_lower_run(date, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_higher_lower_run(date, text, uuid, text)
  to service_role;
revoke all on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.submit_higher_lower_choice(date, text, uuid, integer, text)
  to service_role;
revoke all on function public.advance_higher_lower_round(date, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.advance_higher_lower_round(date, text, uuid, integer)
  to service_role;
revoke all on function public.settle_higher_lower_week(date)
  from public, anon, authenticated;
grant execute on function public.settle_higher_lower_week(date)
  to service_role;
