-- FPL'dle freezes its clue pool from the latest card edition. The candidates
-- are intentionally public: they power the searchable guess list. The
-- answer lives in a separate service-role-only table so a public table read
-- cannot disclose it.

create table if not exists public.fpldle_daily_candidates (
  puzzle_date  date not null,
  league       text not null check (league in ('premier', 'academy')),
  season       text not null,
  edition_week date not null,
  player_slug  text not null,
  player_name  text not null,
  player_tag   text not null,
  team         text not null,
  position     text not null,
  champion     text not null,
  overall      int not null check (overall between 1 and 99),
  primary key (puzzle_date, league, player_slug)
);

create table if not exists public.fpldle_daily_puzzles (
  puzzle_date date not null,
  league      text not null check (league in ('premier', 'academy')),
  answer_slug text not null,
  created_at  timestamptz not null default now(),
  reset_at    timestamptz not null,
  primary key (puzzle_date, league),
  foreign key (puzzle_date, league, answer_slug)
    references public.fpldle_daily_candidates (puzzle_date, league, player_slug)
);

create index if not exists fpldle_daily_candidates_lookup_idx
  on public.fpldle_daily_candidates (puzzle_date, league);

-- Grants and RLS are separate controls. Candidates are the public guess pool;
-- puzzle rows, including answer_slug, are never exposed to client roles.
alter table public.fpldle_daily_candidates enable row level security;
alter table public.fpldle_daily_puzzles enable row level security;

revoke all on table public.fpldle_daily_candidates from anon, authenticated;
grant select on table public.fpldle_daily_candidates to anon, authenticated;
grant all on table public.fpldle_daily_candidates to service_role;

drop policy if exists fpldle_daily_candidates_public_read on public.fpldle_daily_candidates;
create policy fpldle_daily_candidates_public_read
  on public.fpldle_daily_candidates
  for select
  to anon, authenticated
  using (true);

revoke all on table public.fpldle_daily_puzzles from anon, authenticated;
grant all on table public.fpldle_daily_puzzles to service_role;

-- One short transaction owns the whole lazy creation path. The lock key is
-- scoped to UTC date + league, so Premier and Academy do not serialize each
-- other and concurrent first requests cannot choose different answers.
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
    position,
    champion,
    overall
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
    candidate.position,
    candidate.champion,
    candidate.overall
  from jsonb_to_recordset(p_candidates) as candidate(
    player_slug text,
    player_name text,
    player_tag text,
    team text,
    position text,
    champion text,
    overall int
  )
  where nullif(trim(candidate.player_slug), '') is not null
    and nullif(trim(candidate.player_name), '') is not null
    and nullif(trim(candidate.player_tag), '') is not null
    and nullif(trim(candidate.team), '') is not null
    and nullif(trim(candidate.position), '') is not null
    and nullif(trim(candidate.champion), '') is not null
    and candidate.overall between 1 and 99
  on conflict (puzzle_date, league, player_slug) do nothing;

  -- Prefer a candidate different from yesterday's answer when this pool has
  -- any alternative. Fall back to the whole pool when it has only one row.
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

revoke all on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb) from public;
grant execute on function public.ensure_fpldle_daily_puzzle(date, text, text, date, jsonb) to service_role;
