alter table public.fpldle_daily_candidates
  add column if not exists team_logo_url text,
  add column if not exists division text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fpldle_daily_candidates'::regclass
      and conname = 'fpldle_daily_candidates_division_check'
  ) then
    alter table public.fpldle_daily_candidates
      add constraint fpldle_daily_candidates_division_check
      check (division in ('Solari', 'Lunari') or division is null);
  end if;
end $$;

-- Preserve the answer while filling metadata on puzzles created before this
-- migration. New puzzles get these values from the snapshot function below.
update public.fpldle_daily_candidates candidate
set team_logo_url = nullif(edition.card->>'teamImageUrl', '')
from public.card_editions edition
where edition.season = candidate.season
  and edition.edition_week = candidate.edition_week
  and edition.slug = candidate.player_slug
  and candidate.team_logo_url is null;

update public.fpldle_daily_candidates candidate
set division = team.division
from public.league_settings settings
join public.teams team on team.draft_id = settings.featured_draft_id
where candidate.league = 'premier'
  and candidate.season = settings.current_season
  and candidate.team = team.name
  and candidate.division is null;

create or replace function public.ensure_fpldle_daily_puzzle(
  p_puzzle_date date,
  p_league text,
  p_season text,
  p_edition_week date,
  p_candidates jsonb
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_answer_slug text;
begin
  if p_league not in ('premier', 'academy') then
    raise exception 'FPLDLE_INVALID_LEAGUE';
  end if;

  if jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'FPLDLE_INVALID_CANDIDATES';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('fpldle:' || p_puzzle_date::text || ':' || p_league)
  );

  if exists (
    select 1
    from public.fpldle_daily_puzzles
    where puzzle_date = p_puzzle_date
      and league = p_league
  ) then
    return;
  end if;

  insert into public.fpldle_daily_candidates (
    puzzle_date,
    league,
    season,
    edition_week,
    player_slug,
    player_name,
    player_tag,
    team,
    team_logo_url,
    position,
    champion,
    overall,
    division
  )
  select
    p_puzzle_date,
    p_league,
    p_season,
    p_edition_week,
    candidate.player_slug,
    candidate.player_name,
    candidate.player_tag,
    candidate.team,
    candidate.team_logo_url,
    candidate.position,
    candidate.champion,
    candidate.overall,
    candidate.division
  from jsonb_to_recordset(p_candidates) as candidate(
    player_slug text,
    player_name text,
    player_tag text,
    team text,
    team_logo_url text,
    position text,
    champion text,
    overall int,
    division text
  )
  where nullif(trim(candidate.player_slug), '') is not null
    and nullif(trim(candidate.player_name), '') is not null
    and nullif(trim(candidate.player_tag), '') is not null
    and nullif(trim(candidate.team), '') is not null
    and nullif(trim(candidate.position), '') is not null
    and nullif(trim(candidate.champion), '') is not null
    and candidate.overall between 1 and 99
    and (candidate.division is null or candidate.division in ('Solari', 'Lunari'))
  on conflict (puzzle_date, league, player_slug) do nothing;

  select candidate.player_slug
  into v_answer_slug
  from public.fpldle_daily_candidates candidate
  where candidate.puzzle_date = p_puzzle_date
    and candidate.league = p_league
    and not exists (
      select 1
      from public.fpldle_daily_puzzles previous
      where previous.puzzle_date = p_puzzle_date - 1
        and previous.league = p_league
        and previous.answer_slug = candidate.player_slug
    )
  order by random()
  limit 1;

  if v_answer_slug is null then
    select candidate.player_slug
    into v_answer_slug
    from public.fpldle_daily_candidates candidate
    where candidate.puzzle_date = p_puzzle_date
      and candidate.league = p_league
    order by random()
    limit 1;
  end if;

  if v_answer_slug is null then
    raise exception 'FPLDLE_NO_CANDIDATES';
  end if;

  insert into public.fpldle_daily_puzzles (
    puzzle_date,
    league,
    answer_slug,
    reset_at
  )
  values (
    p_puzzle_date,
    p_league,
    v_answer_slug,
    ((p_puzzle_date + 1)::timestamp at time zone 'UTC')
  )
  on conflict (puzzle_date, league) do nothing;
end;
$$;

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

  delete from public.fpldle_daily_puzzles
  where puzzle_date = p_puzzle_date
    and league = p_league;

  delete from public.fpldle_daily_candidates
  where puzzle_date = p_puzzle_date
    and league = p_league;
end;
$$;

revoke all on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb) from public;
grant execute on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb) to service_role;

revoke all on function public.reset_fpldle_daily_puzzle(date, text) from public;
grant execute on function public.reset_fpldle_daily_puzzle(date, text) to service_role;
