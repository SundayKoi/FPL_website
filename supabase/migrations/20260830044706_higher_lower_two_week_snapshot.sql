-- Draw Higher or Lower candidates from the two newest archived card weeks.
-- The week prefix makes repeated player slugs from different card archives
-- distinct inside the private daily snapshot and the run state machine.

create or replace function public.ensure_higher_lower_daily_candidates_weeks(
  p_puzzle_date date,
  p_league text,
  p_season text,
  p_edition_weeks date[]
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_league not in ('premier', 'academy')
     or p_edition_weeks is null
     or cardinality(p_edition_weeks) = 0 then
    raise exception 'HIGHER_LOWER_INVALID_SNAPSHOT';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('higher-lower-candidates:' || p_puzzle_date::text || ':' || p_league)
  );

  insert into public.higher_lower_daily_candidates (
    puzzle_date, league, season, edition_week, player_slug, player_name, overall, card
  )
  select
    p_puzzle_date,
    p_league,
    p_season,
    edition.edition_week,
    edition.edition_week::text || ':' || edition.slug,
    edition.player_name,
    edition.overall,
    edition.card
  from public.card_editions edition
  where edition.season = p_season
    and edition.edition_week = any(p_edition_weeks)
    and edition.overall between 1 and 99
    and jsonb_typeof(edition.card) = 'object'
    -- Existing snapshots from the single-week implementation already have
    -- their first archive. Extend them only with weeks not frozen yet.
    and not exists (
      select 1
      from public.higher_lower_daily_candidates existing
      where existing.puzzle_date = p_puzzle_date
        and existing.league = p_league
        and existing.edition_week = edition.edition_week
    )
  on conflict (puzzle_date, league, player_slug) do nothing;

  select count(*)::integer
  into v_count
  from public.higher_lower_daily_candidates
  where puzzle_date = p_puzzle_date and league = p_league;

  return v_count;
end;
$$;

revoke all on function public.ensure_higher_lower_daily_candidates_weeks(date, text, text, date[])
  from public, anon, authenticated;
grant execute on function public.ensure_higher_lower_daily_candidates_weeks(date, text, text, date[])
  to service_role;
