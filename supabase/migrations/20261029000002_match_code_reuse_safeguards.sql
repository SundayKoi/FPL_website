-- Reclaim previously assigned tournament codes only while their original
-- fixture/game has no ingested Riot stats. The private-data guard is attached
-- to match_codes itself, so direct admin writes and all existing RPCs obey the
-- same rule. The postseason allocator explicitly releases unused assignments
-- before inserting their new slots.

create or replace function public._match_code_game_was_ingested(
  p_fixture_id uuid,
  p_game_number integer
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_fixture_id is not null and exists (
    select 1
    from public.match_reports report
    join public.match_report_games game on game.report_id = report.id
    join public.raw_stats stats on stats.match_id = game.match_id
    where report.fixture_id = p_fixture_id
      and game.game_number = p_game_number
  );
$$;

revoke all on function public._match_code_game_was_ingested(uuid, integer) from public, anon, authenticated, service_role;

create or replace function public._guard_match_code_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_key text;
  v_ignore_id uuid;
  v_duplicate_used boolean;
  v_duplicate_assigned boolean;
begin
  if tg_op = 'DELETE' then
    if public._match_code_game_was_ingested(old.fixture_id, old.game_number) then
      raise exception 'CODES_ALREADY_USED: an ingested tournament code cannot be removed or reassigned';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    v_ignore_id := old.id;
    if old.fixture_id is not distinct from new.fixture_id
       and old.game_number is not distinct from new.game_number
       and old.code is not distinct from new.code then
      return new;
    end if;
    if public._match_code_game_was_ingested(old.fixture_id, old.game_number)
       or public._match_code_game_was_ingested(new.fixture_id, new.game_number) then
      raise exception 'CODES_ALREADY_USED: an ingested tournament code cannot be changed or reassigned';
    end if;
  elsif public._match_code_game_was_ingested(new.fixture_id, new.game_number) then
    raise exception 'CODES_ALREADY_USED: a code cannot be assigned to an ingested game';
  end if;

  v_code_key := lower(btrim(coalesce(new.code, '')));
  if v_code_key = '' then
    raise exception 'CODES_INVALID: tournament code cannot be blank';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('match_code:' || v_code_key));

  select
    coalesce(bool_or(existing.fixture_id is null or public._match_code_game_was_ingested(existing.fixture_id, existing.game_number)), false),
    count(*) > 0
  into v_duplicate_used, v_duplicate_assigned
  from public.match_codes existing
  where lower(btrim(existing.code)) = v_code_key
    and (v_ignore_id is null or existing.id <> v_ignore_id);

  if v_duplicate_used then
    raise exception 'CODES_ALREADY_USED: an ingested tournament code cannot be reassigned';
  end if;
  if v_duplicate_assigned then
    raise exception 'CODES_ALREADY_ASSIGNED: tournament code is still assigned; release its unused assignment first';
  end if;

  return new;
end;
$$;

revoke all on function public._guard_match_code_assignment() from public, anon, authenticated, service_role;

drop trigger if exists guard_match_code_assignment on public.match_codes;
create trigger guard_match_code_assignment
before insert or update or delete on public.match_codes
for each row execute function public._guard_match_code_assignment();

create or replace function public._release_unused_match_code_assignments(p_codes text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_code_key text;
begin
  for v_code_key in
    select distinct lower(btrim(code))
    from unnest(coalesce(p_codes, array[]::text[])) as input(code)
    where btrim(coalesce(code, '')) <> ''
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('match_code:' || v_code_key));
  end loop;

  if exists (
    select 1
    from public.match_codes existing
    where lower(btrim(existing.code)) in (
      select lower(btrim(code))
      from unnest(coalesce(p_codes, array[]::text[])) as input(code)
      where btrim(coalesce(code, '')) <> ''
    )
      and (
        existing.fixture_id is null
        or public._match_code_game_was_ingested(existing.fixture_id, existing.game_number)
      )
  ) then
    raise exception 'CODES_ALREADY_USED: a supplied tournament code belongs to a game with ingested stats and cannot be reassigned';
  end if;

  delete from public.match_codes existing
  where lower(btrim(existing.code)) in (
    select lower(btrim(code))
    from unnest(coalesce(p_codes, array[]::text[])) as input(code)
    where btrim(coalesce(code, '')) <> ''
  );
end;
$$;

revoke all on function public._release_unused_match_code_assignments(text[]) from public, anon, authenticated, service_role;

create or replace function public.replace_match_codes(
  p_fixture_id uuid,
  p_season text,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_codes text[]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
  v_codes text[];
begin
  perform public._require_admin();

  select coalesce(array_agg(trimmed order by ord), array[]::text[])
  into v_codes
  from (
    select ord, btrim(coalesce(code, '')) as trimmed
    from unnest(coalesce(p_codes, array[]::text[])) with ordinality as t(code, ord)
  ) input_codes
  where trimmed <> '';

  if exists (
    select 1 from unnest(v_codes) as input(code)
    group by lower(btrim(code))
    having count(*) > 1
  ) then
    raise exception 'CODES_DUPLICATE: tournament codes must be unique within the input';
  end if;

  perform public._release_unused_match_code_assignments(v_codes);
  delete from public.match_codes where fixture_id = p_fixture_id;

  -- created_by is stamped from the caller's own auth.uid() (same pattern
  -- is_admin()/_require_admin() themselves rely on inside a SECURITY
  -- DEFINER function) rather than taken as a parameter -- mirrors
  -- src/lib/captain/queries.ts's submitReport deriving submitted_by the
  -- same way instead of trusting a client-supplied id.
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code, created_by)
  select p_fixture_id, p_season, p_team_a_id, p_team_b_id, row_number() over (order by ord), trimmed, auth.uid()
  from (
    select ord, trim(code) as trimmed
    from unnest(p_codes) with ordinality as t(code, ord)
  ) s
  where trimmed <> '';

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.replace_match_codes(uuid, text, uuid, uuid, text[]) from public;
grant execute on function public.replace_match_codes(uuid, text, uuid, uuid, text[]) to authenticated, service_role;

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

  if exists (
    select 1 from unnest(v_codes[1:v_required_code_count]) as input(code)
    group by lower(btrim(code))
    having count(*) > 1
  ) then
    raise exception 'CODES_DUPLICATE: tournament codes must be unique within the assigned input';
  end if;

  perform public._release_unused_match_code_assignments(v_codes[1:v_required_code_count]);
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

create or replace function public.populate_postseason_match_codes(
  p_league text,
  p_season text,
  p_scope text,
  p_expected_fixtures jsonb,
  p_expected_codes jsonb,
  p_assignments jsonb,
  p_codes text[],
  p_expected_missing_slots integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_configured_season text;
  v_configured_draft_id uuid;
  v_current_fixtures jsonb;
  v_current_codes jsonb;
  v_codes text[];
  v_missing_count integer := 0;
  v_base_missing_count integer := 0;
  v_reclaimed_count integer := 0;
  v_next_missing_count integer := 0;
  v_assignment_codes text[];
  v_inserted integer := 0;
  v_fixture_count integer := 0;
begin
  perform public._require_admin();

  if p_league not in ('premier', 'academy') then
    raise exception 'LEAGUE_INVALID: league must be premier or academy';
  end if;
  if p_scope not in ('gauntlet', 'playoffs', 'all-postseason') then
    raise exception 'SCOPE_INVALID: scope must be gauntlet, playoffs, or all-postseason';
  end if;
  if p_expected_missing_slots is null or p_expected_missing_slots < 0 then
    raise exception 'PREVIEW_INVALID: missing-slot count is required';
  end if;
  if jsonb_typeof(coalesce(p_expected_fixtures, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_expected_codes, 'null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_assignments, 'null'::jsonb)) <> 'array' then
    raise exception 'PREVIEW_INVALID: expected state and assignments must be JSON arrays';
  end if;

  -- Serialize two admins reviewing the same bracket scope. The row locks
  -- below remain the authoritative protection, while this also covers an
  -- empty target set where there would be no fixture row to lock.
  perform pg_advisory_xact_lock(
    hashtext('populate_postseason_match_codes:' || p_league || ':' || p_season || ':' || p_scope)
  );

  select
    case when p_league = 'premier' then settings.current_season else settings.academy_season end,
    case when p_league = 'premier' then settings.featured_draft_id else settings.academy_draft_id end
  into v_configured_season, v_configured_draft_id
  from public.league_settings settings
  where settings.id = 1
  for share;

  if v_configured_season is null then
    raise exception 'LEAGUE_SETTINGS_INVALID: selected league season is not configured';
  end if;
  if p_season is distinct from v_configured_season then
    raise exception 'SEASON_INVALID: supplied season must match the configured % season %', p_league, v_configured_season;
  end if;
  if v_configured_draft_id is null then
    raise exception 'LEAGUE_SETTINGS_INVALID: selected league draft is not configured';
  end if;

  -- Lock the configured team identity sources before resolving fixture text.
  -- The tables are small reference sets; taking share locks here keeps a
  -- concurrent rename or draft-team edit from changing the resolution after
  -- the preview state has been checked.
  perform 1 from public.teams draft_team where draft_team.draft_id = v_configured_draft_id for share;
  perform 1 from public.league_teams league_team for share;

  create temporary table _postseason_target_fixtures (
    id uuid primary key,
    stage public.fixture_stage not null,
    sort_order integer not null,
    team_a text,
    team_b text,
    best_of integer not null,
    score_a integer,
    score_b integer,
    stage_rank integer not null,
    team_a_id uuid,
    team_b_id uuid,
    team_a_matches integer not null,
    team_b_matches integer not null
  ) on commit drop;

  insert into pg_temp._postseason_target_fixtures (
    id, stage, sort_order, team_a, team_b, best_of, score_a, score_b,
    stage_rank, team_a_id, team_b_id, team_a_matches, team_b_matches
  )
  select
    f.id,
    f.stage,
    f.sort_order,
    f.team_a,
    f.team_b,
    f.best_of,
    f.score_a,
    f.score_b,
    case f.stage
      when 'gauntlet_r1' then 0
      when 'gauntlet_r2' then 1
      when 'quarterfinals' then 2
      when 'semifinals' then 3
      when 'finals' then 4
    end,
    coalesce(team_a.team_id, null),
    coalesce(team_b.team_id, null),
    coalesce(team_a.matches, 0),
    coalesce(team_b.matches, 0)
  from public.fixtures f
  left join lateral (
    select
      count(distinct (draft_team.id, lt.id))::integer as matches,
      (array_agg(lt.id order by lt.id))[1] as team_id
    from public.teams draft_team
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(f.team_a))
    where draft_team.draft_id = v_configured_draft_id
      and lower(trim(draft_team.name)) = lower(trim(f.team_a))
      and f.team_a is not null
      and btrim(f.team_a) <> ''
  ) team_a on true
  left join lateral (
    select
      count(distinct (draft_team.id, lt.id))::integer as matches,
      (array_agg(lt.id order by lt.id))[1] as team_id
    from public.teams draft_team
    join public.league_teams lt
      on lower(trim(lt.name)) = lower(trim(f.team_b))
    where draft_team.draft_id = v_configured_draft_id
      and lower(trim(draft_team.name)) = lower(trim(f.team_b))
      and f.team_b is not null
      and btrim(f.team_b) <> ''
  ) team_b on true
  where f.season = v_configured_season
    -- Fixtures have no league column. A known team on either side anchors a
    -- TBD postseason slot to the selected draft; a fully TBD slot has no
    -- authoritative league identity yet and is left for a later rerun.
    and (
      exists (
        select 1
        from public.teams draft_team
        where draft_team.draft_id = v_configured_draft_id
          and lower(trim(draft_team.name)) = lower(trim(f.team_a))
          and f.team_a is not null
          and btrim(f.team_a) <> ''
      )
      or exists (
        select 1
        from public.teams draft_team
        where draft_team.draft_id = v_configured_draft_id
          and lower(trim(draft_team.name)) = lower(trim(f.team_b))
          and f.team_b is not null
          and btrim(f.team_b) <> ''
      )
    )
    and (
      (p_scope = 'gauntlet' and f.stage in ('gauntlet_r1', 'gauntlet_r2'))
      or (p_scope = 'playoffs' and f.stage in ('quarterfinals', 'semifinals', 'finals'))
      or (p_scope = 'all-postseason' and f.stage in (
        'gauntlet_r1', 'gauntlet_r2', 'quarterfinals', 'semifinals', 'finals'
      ))
    )
  for update of f;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', target.id,
        'stage', target.stage,
        'sortOrder', target.sort_order,
        'teamA', target.team_a,
        'teamB', target.team_b,
        'bestOf', target.best_of,
        'scoreA', target.score_a,
        'scoreB', target.score_b
      ) order by target.stage_rank, target.sort_order, target.id
    ),
    '[]'::jsonb
  )
  into v_current_fixtures
  from pg_temp._postseason_target_fixtures target;

  if v_current_fixtures <> p_expected_fixtures then
    raise exception 'STALE_PREVIEW: postseason fixtures changed after the preview';
  end if;

  if exists (
    select 1
    from pg_temp._postseason_target_fixtures target
    where target.score_a is null
      and target.score_b is null
      and btrim(coalesce(target.team_a, '')) <> ''
      and btrim(coalesce(target.team_b, '')) <> ''
      and (target.team_a_matches <> 1 or target.team_b_matches <> 1)
  ) then
    raise exception 'FIXTURE_TEAMS_AMBIGUOUS: every non-TBD postseason team name must resolve to exactly one configured league team';
  end if;

  -- Lock the private rows before taking the state snapshot used for the stale
  -- preview check. The fixture locks above protect names, scores, and scope.
  perform 1
  from public.match_codes code
  where code.fixture_id in (select target.id from pg_temp._postseason_target_fixtures target)
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', code.id,
        'fixtureId', code.fixture_id,
        'gameNumber', code.game_number,
        'code', code.code
      ) order by target.stage_rank, target.sort_order, target.id, code.game_number, code.id
    ),
    '[]'::jsonb
  )
  into v_current_codes
  from public.match_codes code
  join pg_temp._postseason_target_fixtures target on target.id = code.fixture_id;

  if v_current_codes <> p_expected_codes then
    raise exception 'STALE_PREVIEW: postseason code assignments changed after the preview';
  end if;

  if exists (
    select 1
    from public.match_codes code
    join pg_temp._postseason_target_fixtures target on target.id = code.fixture_id
    where target.score_a is null
      and target.score_b is null
      and btrim(coalesce(target.team_a, '')) <> ''
      and btrim(coalesce(target.team_b, '')) <> ''
      and (code.game_number < 1 or code.game_number > target.best_of)
  ) then
    raise exception 'EXISTING_CODES_INVALID: an existing postseason code has an invalid game number';
  end if;

  select count(*)::integer
  into v_base_missing_count
  from pg_temp._postseason_target_fixtures target
  cross join lateral generate_series(1, target.best_of) as games(game_number)
  where target.score_a is null
    and target.score_b is null
    and btrim(coalesce(target.team_a, '')) <> ''
    and btrim(coalesce(target.team_b, '')) <> ''
    and target.team_a_matches = 1
    and target.team_b_matches = 1
    and not exists (
      select 1
      from public.match_codes code
      where code.fixture_id = target.id
        and code.game_number = games.game_number
    );

  select coalesce(array_agg(trimmed order by ord), array[]::text[])
  into v_codes
  from (
    select ord, btrim(coalesce(raw_code, '')) as trimmed
    from unnest(coalesce(p_codes, array[]::text[])) with ordinality as input(raw_code, ord)
  ) codes
  where trimmed <> '';

  if exists (
    select 1
    from (
      select lower(btrim(code)) as normalized, count(*) as code_count
      from unnest(v_codes) as input(code)
      group by lower(btrim(code))
    ) duplicate_codes
    where duplicate_codes.code_count > 1
  ) then
    raise exception 'CODES_DUPLICATE: tournament codes must be unique within the input';
  end if;

  v_missing_count := v_base_missing_count;
  loop
    v_assignment_codes := v_codes[1:v_missing_count];
    select count(*)::integer
    into v_reclaimed_count
    from public.match_codes existing
    join pg_temp._postseason_target_fixtures target on target.id = existing.fixture_id
    where target.score_a is null
      and target.score_b is null
      and btrim(coalesce(target.team_a, '')) <> ''
      and btrim(coalesce(target.team_b, '')) <> ''
      and target.team_a_matches = 1
      and target.team_b_matches = 1
      and existing.game_number between 1 and target.best_of
      and exists (
        select 1
        from unnest(coalesce(v_assignment_codes, array[]::text[])) as input(code)
        where lower(btrim(existing.code)) = lower(btrim(input.code))
      );

    v_next_missing_count := v_base_missing_count + coalesce(v_reclaimed_count, 0);
    exit when v_next_missing_count = v_missing_count;
    v_missing_count := v_next_missing_count;
  end loop;

  if p_expected_missing_slots <> v_missing_count then
    raise exception 'STALE_PREVIEW: missing postseason slots changed after the preview';
  end if;

  if coalesce(array_length(v_codes, 1), 0) < v_missing_count then
    raise exception 'CODES_INSUFFICIENT: need at least % new tournament codes for the missing postseason slots', v_missing_count;
  end if;

  v_assignment_codes := v_codes[1:v_missing_count];
  perform public._release_unused_match_code_assignments(v_assignment_codes);

  create temporary table _postseason_requested_assignments (
    fixture_id uuid not null,
    game_number integer not null,
    code text not null
  ) on commit drop;

  insert into pg_temp._postseason_requested_assignments (fixture_id, game_number, code)
  select
    (assignment->>'fixtureId')::uuid,
    (assignment->>'gameNumber')::integer,
    btrim(assignment->>'code')
  from jsonb_array_elements(p_assignments) assignment;

  if exists (
    select 1
    from (
      select fixture_id, game_number, count(*) as assignment_count
      from pg_temp._postseason_requested_assignments
      group by fixture_id, game_number
    ) duplicates
    where duplicates.assignment_count > 1
  ) then
    raise exception 'ASSIGNMENTS_INVALID: a fixture game slot appears more than once';
  end if;

  create temporary table _postseason_expected_assignments (
    fixture_id uuid not null,
    game_number integer not null,
    code text not null
  ) on commit drop;

  insert into pg_temp._postseason_expected_assignments (fixture_id, game_number, code)
  select
    target.id,
    games.game_number,
    v_codes[(row_number() over (
      order by target.stage_rank, target.sort_order, target.id, games.game_number
    ))::integer]
  from pg_temp._postseason_target_fixtures target
  cross join lateral generate_series(1, target.best_of) as games(game_number)
  where target.score_a is null
    and target.score_b is null
    and btrim(coalesce(target.team_a, '')) <> ''
    and btrim(coalesce(target.team_b, '')) <> ''
    and target.team_a_matches = 1
    and target.team_b_matches = 1
    and not exists (
      select 1
      from public.match_codes code
      where code.fixture_id = target.id
        and code.game_number = games.game_number
    );

  if (select count(*) from pg_temp._postseason_requested_assignments) <> v_missing_count
     or exists (
       select 1
       from pg_temp._postseason_requested_assignments requested
       left join pg_temp._postseason_expected_assignments expected
         on expected.fixture_id = requested.fixture_id
        and expected.game_number = requested.game_number
       where expected.fixture_id is null or expected.code <> requested.code
     )
     or exists (
       select 1
       from pg_temp._postseason_expected_assignments expected
       left join pg_temp._postseason_requested_assignments requested
         on requested.fixture_id = expected.fixture_id
        and requested.game_number = expected.game_number
        and requested.code = expected.code
       where requested.fixture_id is null
     ) then
    raise exception 'ASSIGNMENTS_INVALID: reviewed assignments no longer match the supplied code order and missing slots';
  end if;

  insert into public.match_codes (
    fixture_id, season, team_a_id, team_b_id, game_number, code, created_by
  )
  select
    expected.fixture_id,
    p_season,
    target.team_a_id,
    target.team_b_id,
    expected.game_number,
    expected.code,
    auth.uid()
  from pg_temp._postseason_expected_assignments expected
  join pg_temp._postseason_target_fixtures target on target.id = expected.fixture_id;

  get diagnostics v_inserted = row_count;

  select count(distinct fixture_id)::integer
  into v_fixture_count
  from pg_temp._postseason_expected_assignments;

  return jsonb_build_object(
    'inserted_count', v_inserted,
    'fixture_count', v_fixture_count,
    'season', p_season,
    'league', p_league,
    'scope', p_scope
  );
end;
$$;

revoke all on function public.populate_postseason_match_codes(text, text, text, jsonb, jsonb, jsonb, text[], integer) from public;
grant execute on function public.populate_postseason_match_codes(text, text, text, jsonb, jsonb, jsonb, text[], integer) to authenticated, service_role;
