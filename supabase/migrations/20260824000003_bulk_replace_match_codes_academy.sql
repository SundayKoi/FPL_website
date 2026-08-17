-- Allow the bulk tournament-code importer to target either league while
-- deriving the season and draft server-side from the supplied season.
create or replace function public.bulk_replace_match_codes(
  p_season text,
  p_fixture_ids uuid[],
  p_codes text[]
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_season text;
  v_draft_id uuid;
  v_expected_fixture_count int;
  v_target_fixture_count int;
  v_required_code_count int;
  v_unresolved_team_count int;
  v_inserted int;
  v_codes text[];
  v_ordered_fixture_ids uuid[];
  v_ordered_team_a_ids uuid[];
  v_ordered_team_b_ids uuid[];
begin
  perform public._require_admin();

  v_expected_fixture_count := coalesce(array_length(p_fixture_ids, 1), 0);
  if v_expected_fixture_count = 0 then
    raise exception 'FIXTURES_REQUIRED: at least one fixture is required';
  end if;

  if exists(select 1 from unnest(p_fixture_ids) as requested(id) where id is null)
    or (select count(*) from unnest(p_fixture_ids) as requested(id)) <>
       (select count(distinct id) from unnest(p_fixture_ids) as requested(id)) then
    raise exception 'FIXTURE_INVALID: fixture IDs must be non-null and unique';
  end if;

  select case
    when settings.current_season = p_season then settings.current_season
    when settings.academy_season = p_season then settings.academy_season
  end,
  case
    when settings.current_season = p_season then settings.featured_draft_id
    when settings.academy_season = p_season then settings.academy_draft_id
  end
  into v_current_season, v_draft_id
  from public.league_settings settings
  where settings.id = 1
  for share;

  if v_current_season is null then
    raise exception 'SEASON_INVALID: supplied season must match a configured league season';
  end if;
  if v_draft_id is null then
    raise exception 'LEAGUE_SETTINGS_INVALID: selected league draft is not configured';
  end if;

  with locked_targets as materialized (
    select f.id, f.sort_order,
      (select lt.id from public.league_teams lt where lower(trim(lt.name)) = lower(trim(f.team_a)) order by lt.id limit 1) as team_a_id,
      (select lt.id from public.league_teams lt where lower(trim(lt.name)) = lower(trim(f.team_b)) order by lt.id limit 1) as team_b_id,
      case f.stage when 'week_1' then 0 when 'week_2' then 1 when 'week_3' then 2 when 'week_4' then 3
        when 'week_5' then 4 when 'gauntlet_r1' then 5 when 'gauntlet_r2' then 6 when 'quarterfinals' then 7
        when 'semifinals' then 8 when 'finals' then 9 end as stage_rank
    from public.fixtures f
    where f.season = v_current_season and f.score_a is null and f.score_b is null
      and exists (select 1 from public.teams t where t.draft_id = v_draft_id and lower(trim(t.name)) = lower(trim(f.team_a)))
      and exists (select 1 from public.teams t where t.draft_id = v_draft_id and lower(trim(t.name)) = lower(trim(f.team_b)))
    for update of f
  )
  select coalesce(array_agg(id order by stage_rank, sort_order, id), array[]::uuid[]),
    coalesce(array_agg(team_a_id order by stage_rank, sort_order, id), array[]::uuid[]),
    coalesce(array_agg(team_b_id order by stage_rank, sort_order, id), array[]::uuid[]),
    count(*), count(*) filter (where team_a_id is null or team_b_id is null)
  into v_ordered_fixture_ids, v_ordered_team_a_ids, v_ordered_team_b_ids, v_target_fixture_count, v_unresolved_team_count
  from locked_targets;

  if v_expected_fixture_count <> v_target_fixture_count or exists (
    select 1 from unnest(p_fixture_ids) as requested(id) where not (requested.id = any(v_ordered_fixture_ids))
  ) then
    raise exception 'FIXTURE_SCOPE_INVALID: supplied fixture IDs must exactly match the complete current unplayed league fixture set';
  end if;
  if v_unresolved_team_count > 0 then
    raise exception 'FIXTURE_INVALID: every fixture team must resolve to a league team';
  end if;

  select coalesce(array_agg(normalized order by ord), array[]::text[]) into v_codes
  from (
    select ord, regexp_replace(coalesce(code, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') as normalized
    from unnest(p_codes) with ordinality as requested(code, ord)
  ) normalized_codes where normalized <> '';

  v_required_code_count := v_target_fixture_count * 3;
  if coalesce(array_length(v_codes, 1), 0) < v_required_code_count then
    raise exception 'CODES_INSUFFICIENT: need at least 3 nonblank codes per fixture';
  end if;

  delete from public.match_codes where fixture_id = any(v_ordered_fixture_ids);
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code, created_by)
  select v_ordered_fixture_ids[((n - 1) / 3) + 1], v_current_season,
    v_ordered_team_a_ids[((n - 1) / 3) + 1], v_ordered_team_b_ids[((n - 1) / 3) + 1],
    ((n - 1) % 3) + 1, v_codes[n], auth.uid()
  from generate_series(1, v_required_code_count) as gs(n);

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.bulk_replace_match_codes(text, uuid[], text[]) from public;
grant execute on function public.bulk_replace_match_codes(text, uuid[], text[]) to authenticated, service_role;
