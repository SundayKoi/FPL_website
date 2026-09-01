-- Betting closes at the scheduled Monday 8:00 PM Eastern kickoff.
-- This file uses a unique migration version so it cannot collide with the
-- existing player identity migration.
-- Existing open markets are brought to the same contract; resolved and
-- cancelled history remains unchanged.

update public.betting_markets
   set lock_at = game_at
 where status = 'OPEN'
   and lock_at is distinct from game_at;

create or replace function public.create_market_admin(
  p_actor text, p_event bigint, p_team_a bigint, p_team_b bigint,
  p_title text, p_rules text, p_game_at timestamptz, p_rake_bps int,
  p_open_line_prob_a numeric default null, p_draw_enabled boolean default false
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  insert into betting_markets(event_id, team_a_id, team_b_id, title, rules, game_at, lock_at,
                      rake_bps, open_line_prob_a, draw_enabled, created_by)
    values (p_event, p_team_a, p_team_b, p_title, p_rules, p_game_at,
            p_game_at, coalesce(p_rake_bps, 0),
            p_open_line_prob_a, coalesce(p_draw_enabled, false), p_actor)
    returning id into v_id;
  perform public._audit(p_actor, 'market_create', 'betting_markets:' || v_id, null,
                 jsonb_build_object('event', p_event, 'teams', jsonb_build_array(p_team_a, p_team_b),
                                    'draw', p_draw_enabled));
  return v_id;
end;
$$;

create or replace function public.generate_weekly_betting_markets(
  p_run_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_date date := (p_run_at at time zone 'America/New_York')::date;
  v_target_monday date := v_local_date + 6;
  v_current_season text;
  v_academy_season text;
  v_premier_draft uuid;
  v_academy_draft uuid;
  v_event_count int;
  v_event_id bigint;
  v_draft_id uuid;
  v_season text;
  v_league text;
  v_fixture record;
  v_candidate record;
  v_market public.betting_markets%rowtype;
  v_draft_team_count int;
  v_betting_team_count int;
  v_draft_team_a public.teams%rowtype;
  v_draft_team_b public.teams%rowtype;
  v_betting_team_a public.betting_teams%rowtype;
  v_betting_team_b public.betting_teams%rowtype;
  v_candidates int := 0;
  v_created int := 0;
  v_existing int := 0;
  v_league_candidates int;
begin
  if p_run_at is null then
    raise exception 'run timestamp is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('weekly_betting_market_generator'));

  select current_season, academy_season, featured_draft_id, academy_draft_id
    into v_current_season, v_academy_season, v_premier_draft, v_academy_draft
    from public.league_settings
   where id = 1;
  if not found or v_current_season is null or v_academy_season is null
     or v_premier_draft is null or v_academy_draft is null then
    raise exception 'weekly betting generation requires current/academy seasons and both featured drafts';
  end if;

  drop table if exists pg_temp.weekly_betting_candidates;
  create temporary table weekly_betting_candidates (
    league text not null,
    fixture_id uuid primary key,
    event_id bigint not null,
    team_a_id bigint not null,
    team_b_id bigint not null,
    title text not null,
    game_at timestamptz not null,
    lock_at timestamptz not null
  ) on commit drop;

  for v_league, v_season, v_draft_id in
    select * from (values
      ('premier'::text, v_current_season, v_premier_draft),
      ('academy'::text, v_academy_season, v_academy_draft)
    ) as leagues(league, season, draft_id)
  loop
    select count(*)::int, min(id)
      into v_event_count, v_event_id
      from public.betting_events
     where league = v_league and schedule_season = v_season;
    if v_event_count <> 1 then
      raise exception 'expected exactly one % betting event bound to season %, found %',
        v_league, v_season, v_event_count;
    end if;

    v_league_candidates := 0;
    for v_fixture in
      select f.*
        from public.fixtures f
       where f.season = v_season
         and f.scheduled_at is not null
         and (f.scheduled_at at time zone 'America/New_York')::date = v_target_monday
       order by f.sort_order, f.id
    loop
      v_league_candidates := v_league_candidates + 1;
      if v_fixture.team_a is null or v_fixture.team_b is null then
        raise exception 'fixture % has an incomplete team mapping', v_fixture.id;
      end if;

      select count(*)::int into v_draft_team_count
        from public.teams t
       where t.draft_id = v_draft_id
         and lower(trim(t.name)) = lower(trim(v_fixture.team_a));
      if v_draft_team_count <> 1 then
        raise exception 'fixture % team % maps to % active draft teams',
          v_fixture.id, v_fixture.team_a, v_draft_team_count;
      end if;
      select t.* into v_draft_team_a
        from public.teams t
       where t.draft_id = v_draft_id
         and lower(trim(t.name)) = lower(trim(v_fixture.team_a));

      select count(*)::int into v_draft_team_count
        from public.teams t
       where t.draft_id = v_draft_id
         and lower(trim(t.name)) = lower(trim(v_fixture.team_b));
      if v_draft_team_count <> 1 then
        raise exception 'fixture % team % maps to % active draft teams',
          v_fixture.id, v_fixture.team_b, v_draft_team_count;
      end if;
      select t.* into v_draft_team_b
        from public.teams t
       where t.draft_id = v_draft_id
         and lower(trim(t.name)) = lower(trim(v_fixture.team_b));

      select count(*)::int into v_betting_team_count
        from public.betting_teams t
       where coalesce(t.is_prop_outcome, false) = false
         and upper(trim(t.short_code)) = upper(trim(v_draft_team_a.abbreviation));
      if v_betting_team_count <> 1 then
        raise exception 'fixture % team code % maps to % betting teams',
          v_fixture.id, v_draft_team_a.abbreviation, v_betting_team_count;
      end if;
      select t.* into v_betting_team_a
        from public.betting_teams t
       where coalesce(t.is_prop_outcome, false) = false
         and upper(trim(t.short_code)) = upper(trim(v_draft_team_a.abbreviation));

      select count(*)::int into v_betting_team_count
        from public.betting_teams t
       where coalesce(t.is_prop_outcome, false) = false
         and upper(trim(t.short_code)) = upper(trim(v_draft_team_b.abbreviation));
      if v_betting_team_count <> 1 then
        raise exception 'fixture % team code % maps to % betting teams',
          v_fixture.id, v_draft_team_b.abbreviation, v_betting_team_count;
      end if;
      select t.* into v_betting_team_b
        from public.betting_teams t
       where coalesce(t.is_prop_outcome, false) = false
         and upper(trim(t.short_code)) = upper(trim(v_draft_team_b.abbreviation));

      insert into weekly_betting_candidates(
        league, fixture_id, event_id, team_a_id, team_b_id, title, game_at, lock_at
      ) values (
        v_league,
        v_fixture.id,
        v_event_id,
        v_betting_team_a.id,
        v_betting_team_b.id,
        upper(trim(v_draft_team_a.abbreviation)) || ' vs ' || upper(trim(v_draft_team_b.abbreviation)),
        v_fixture.scheduled_at,
        v_fixture.scheduled_at
      );
    end loop;

    if v_league_candidates = 0 then
      raise exception 'no % fixtures are scheduled for Monday %', v_league, v_target_monday;
    end if;
    v_candidates := v_candidates + v_league_candidates;
  end loop;

  for v_candidate in select * from weekly_betting_candidates order by fixture_id loop
    select * into v_market
      from public.betting_markets m
     where m.fixture_id = v_candidate.fixture_id;
    if found then
      if v_market.event_id is distinct from v_candidate.event_id
         or v_market.team_a_id is distinct from v_candidate.team_a_id
         or v_market.team_b_id is distinct from v_candidate.team_b_id
         or v_market.title is distinct from v_candidate.title
         or v_market.game_at is distinct from v_candidate.game_at
         or v_market.lock_at is distinct from v_candidate.lock_at
         or v_market.rake_bps is distinct from 0
         or v_market.draw_enabled is distinct from false then
        raise exception 'linked market % does not match fixture %',
          v_market.id, v_candidate.fixture_id;
      end if;
      v_existing := v_existing + 1;
    else
      insert into public.betting_markets(
        event_id, team_a_id, team_b_id, title, game_at, lock_at,
        rake_bps, draw_enabled, fixture_id
      ) values (
        v_candidate.event_id, v_candidate.team_a_id, v_candidate.team_b_id,
        v_candidate.title, v_candidate.game_at, v_candidate.lock_at,
        0, false, v_candidate.fixture_id
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'created',
    'target_monday', v_target_monday,
    'candidates', v_candidates,
    'created', v_created,
    'existing', v_existing
  );
end;
$$;
