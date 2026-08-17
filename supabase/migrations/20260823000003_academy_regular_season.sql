-- Academy regular season: the five-week single round robin.
--
-- Six teams, fifteen matchups, everyone plays everyone exactly once. Mondays
-- 8pm ET, matching the league's standard slot.
--
-- Written as a re-runnable function rather than a one-shot block. A database
-- where the academy draft is not configured yet has nothing to schedule, and
-- must not fail `supabase db reset`; the admin wrapper then lets the schedule
-- be applied once the draft exists, without needing another migration.
--
-- Fixtures are matched to existing rows by (stage, unordered team pair) and
-- UPDATED in place rather than replaced. match_codes.fixture_id and
-- match_reports.fixture_id are both "on delete set null", so recreating a
-- fixture would silently detach any tourney codes a captain has already been
-- issued for it. Only rows this schedule does not cover are deleted, and then
-- only when nothing is attached to them.

create or replace function public._seed_academy_regular_season() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season   text;
  v_draft    uuid;
  v_missing  text;
  v_slot     record;
  v_name_a   text;
  v_name_b   text;
  v_id       uuid;
  v_written  int := 0;
  v_stranded int;
begin
  select academy_season, academy_draft_id into v_season, v_draft
  from public.league_settings where id = 1;

  if v_draft is null then
    raise notice 'No academy draft configured; skipping the Academy schedule.';
    return 0;
  end if;

  drop table if exists pg_temp._academy_codes;
  create temporary table pg_temp._academy_codes (code text primary key, expected text);
  insert into pg_temp._academy_codes (code, expected) values
    ('AST',  'Astronauts'),
    ('DA',   'Divine Ascension'),
    ('FELT', 'Flannel Love Tap'),
    ('FNLR', 'Flannel Requiem'),
    ('FPL',  'Free People Legion'),
    ('STRK', 'The Strokers');

  -- Resolved against the Academy draft's own rows, so fixtures carry the exact
  -- team_name the stats and captain pages match on. A name edited in the draft
  -- fails here rather than producing a fixture that silently never appears on
  -- the Academy schedule.
  drop table if exists pg_temp._academy_teams;
  create temporary table pg_temp._academy_teams (code text primary key, name text);
  insert into pg_temp._academy_teams (code, name)
  select c.code, t.name
  from pg_temp._academy_codes c
  join public.teams t
    on t.draft_id = v_draft
   and lower(trim(t.name)) = lower(trim(c.expected));

  select string_agg(c.expected, ', ' order by c.expected)
  into v_missing
  from pg_temp._academy_codes c
  where not exists (select 1 from pg_temp._academy_teams t where t.code = c.code);

  if v_missing is not null then
    raise exception 'These Academy teams are not in the academy draft (check the exact spelling in public.teams): %', v_missing;
  end if;

  -- Kickoffs are written in league time and let Postgres resolve the UTC
  -- offset, so the EDT/EST boundary is not a trap.
  drop table if exists pg_temp._academy_slots;
  create temporary table pg_temp._academy_slots (
    stage public.fixture_stage,
    sort_order int,
    kickoff timestamptz,
    code_a text,
    code_b text
  );
  insert into pg_temp._academy_slots (stage, sort_order, kickoff, code_a, code_b) values
    ('week_1', 1, timestamptz '2026-08-17 20:00:00 America/New_York', 'AST',  'STRK'),
    ('week_1', 2, timestamptz '2026-08-17 20:00:00 America/New_York', 'FPL',  'DA'),
    ('week_1', 3, timestamptz '2026-08-17 20:00:00 America/New_York', 'FELT', 'FNLR'),
    ('week_2', 1, timestamptz '2026-08-24 20:00:00 America/New_York', 'FPL',  'AST'),
    ('week_2', 2, timestamptz '2026-08-24 20:00:00 America/New_York', 'FNLR', 'STRK'),
    ('week_2', 3, timestamptz '2026-08-24 20:00:00 America/New_York', 'DA',   'FELT'),
    ('week_3', 1, timestamptz '2026-08-31 20:00:00 America/New_York', 'STRK', 'DA'),
    ('week_3', 2, timestamptz '2026-08-31 20:00:00 America/New_York', 'AST',  'FNLR'),
    ('week_3', 3, timestamptz '2026-08-31 20:00:00 America/New_York', 'FELT', 'FPL'),
    ('week_4', 1, timestamptz '2026-09-07 20:00:00 America/New_York', 'DA',   'FNLR'),
    ('week_4', 2, timestamptz '2026-09-07 20:00:00 America/New_York', 'FPL',  'STRK'),
    ('week_4', 3, timestamptz '2026-09-07 20:00:00 America/New_York', 'FELT', 'AST'),
    ('week_5', 1, timestamptz '2026-09-14 20:00:00 America/New_York', 'AST',  'DA'),
    ('week_5', 2, timestamptz '2026-09-14 20:00:00 America/New_York', 'STRK', 'FELT'),
    ('week_5', 3, timestamptz '2026-09-14 20:00:00 America/New_York', 'FNLR', 'FPL');

  for v_slot in select * from pg_temp._academy_slots order by stage, sort_order loop
    select name into v_name_a from pg_temp._academy_teams where code = v_slot.code_a;
    select name into v_name_b from pg_temp._academy_teams where code = v_slot.code_b;

    -- Match on the unordered pair: an existing row may have the sides the
    -- other way round, and that is exactly what this schedule corrects.
    select id into v_id
    from public.fixtures
    where season = v_season
      and stage = v_slot.stage
      and (
        (lower(trim(coalesce(team_a, ''))) = lower(v_name_a) and lower(trim(coalesce(team_b, ''))) = lower(v_name_b))
        or (lower(trim(coalesce(team_a, ''))) = lower(v_name_b) and lower(trim(coalesce(team_b, ''))) = lower(v_name_a))
      )
    order by created_at
    limit 1;

    if v_id is not null then
      update public.fixtures
      set team_a = v_name_a,
          team_b = v_name_b,
          scheduled_at = v_slot.kickoff,
          sort_order = v_slot.sort_order,
          best_of = 3,
          division = null
      where id = v_id;
    else
      insert into public.fixtures (season, stage, division, team_a, team_b, scheduled_at, best_of, sort_order)
      values (v_season, v_slot.stage, null, v_name_a, v_name_b, v_slot.kickoff, 3, v_slot.sort_order);
    end if;
    v_written := v_written + 1;
  end loop;

  -- Anything left in the Academy's regular season this round robin does not
  -- describe. A stale row with a result, a tourney code or a submitted report
  -- is left alone and reported: dropping it would destroy history or detach a
  -- captain's code, which is not this function's call to make.
  select count(*) into v_stranded
  from public.fixtures f
  where f.season = v_season
    and f.stage in ('week_1', 'week_2', 'week_3', 'week_4', 'week_5')
    and not exists (
      select 1 from pg_temp._academy_slots s
      join pg_temp._academy_teams a on a.code = s.code_a
      join pg_temp._academy_teams b on b.code = s.code_b
      where s.stage = f.stage
        and lower(trim(coalesce(f.team_a, ''))) = lower(a.name)
        and lower(trim(coalesce(f.team_b, ''))) = lower(b.name)
    )
    and (
      f.score_a is not null
      or exists (select 1 from public.match_codes c where c.fixture_id = f.id)
      or exists (select 1 from public.match_reports r where r.fixture_id = f.id)
    );

  if v_stranded > 0 then
    raise notice 'Left % Academy fixture(s) in place: they carry a result, a tourney code or a report. Review them on /schedule.', v_stranded;
  end if;

  delete from public.fixtures f
  where f.season = v_season
    and f.stage in ('week_1', 'week_2', 'week_3', 'week_4', 'week_5')
    and f.score_a is null
    and not exists (select 1 from public.match_codes c where c.fixture_id = f.id)
    and not exists (select 1 from public.match_reports r where r.fixture_id = f.id)
    and not exists (
      select 1 from pg_temp._academy_slots s
      join pg_temp._academy_teams a on a.code = s.code_a
      join pg_temp._academy_teams b on b.code = s.code_b
      where s.stage = f.stage
        and lower(trim(coalesce(f.team_a, ''))) = lower(a.name)
        and lower(trim(coalesce(f.team_b, ''))) = lower(b.name)
    );

  return v_written;
end;
$$;

revoke all on function public._seed_academy_regular_season() from public;
grant execute on function public._seed_academy_regular_season() to service_role;

-- Admin-callable wrapper, mirroring sync_academy_teams_from_draft's shape, so
-- the schedule can be (re-)applied from SQL once the draft exists.
create or replace function public.seed_academy_regular_season() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._seed_academy_regular_season();
end;
$$;

revoke all on function public.seed_academy_regular_season() from public;
grant execute on function public.seed_academy_regular_season() to authenticated, service_role;

select public._seed_academy_regular_season();
