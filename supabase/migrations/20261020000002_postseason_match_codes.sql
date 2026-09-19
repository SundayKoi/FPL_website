-- Populate missing tournament-code slots for a selected postseason scope.
--
-- The browser builds a human-reviewable preview, but this RPC repeats the
-- allocation and validation under database locks. A preview is therefore a
-- claim about a specific fixture/code state, not permission to write a stale
-- batch. Existing match_codes rows are never deleted or replaced.
create function public.populate_postseason_match_codes(
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
  into v_missing_count
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

  if p_expected_missing_slots <> v_missing_count then
    raise exception 'STALE_PREVIEW: missing postseason slots changed after the preview';
  end if;

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
      select lower(code) as normalized, count(*) as code_count
      from unnest(v_codes) as input(code)
      group by lower(code)
    ) duplicate_codes
    where duplicate_codes.code_count > 1
  ) then
    raise exception 'CODES_DUPLICATE: tournament codes must be unique within the input';
  end if;

  if exists (
    select 1
    from public.match_codes existing
    join unnest(v_codes) as input(code)
      on lower(existing.code) = lower(input.code)
  ) then
    raise exception 'CODES_REUSED: one or more supplied tournament codes are already assigned';
  end if;

  if coalesce(array_length(v_codes, 1), 0) < v_missing_count then
    raise exception 'CODES_INSUFFICIENT: need at least % new tournament codes for the missing postseason slots', v_missing_count;
  end if;

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
