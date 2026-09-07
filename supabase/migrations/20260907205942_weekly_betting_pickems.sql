-- Use the same fixture date as the market generator, and the published stage
-- for the title. Serialized with market generation; retries validate exact legs.
create or replace function public.ensure_weekly_betting_pickems(p_target_monday date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_stages text[];
  v_title text;
  v_markets bigint[];
  v_fixture_count int;
  v_lock timestamptz;
  v_ids bigint[];
  v_pickem public.betting_pickems%rowtype;
  v_carry bigint;
  v_created int := 0;
  v_existing int := 0;
  v_skipped int := 0;
begin
  if p_target_monday is null or extract(isodow from p_target_monday) <> 1 then
    raise exception 'pick-em target must be a Monday';
  end if;
  perform pg_advisory_xact_lock(hashtext('weekly_betting_market_generator'));
  for v_event in
    select e.* from public.betting_events e
    join public.league_settings s on s.id = 1
    where (e.league = 'premier' and e.schedule_season = s.current_season)
       or (e.league = 'academy' and e.schedule_season = s.academy_season)
    order by e.id
  loop
    select array_agg(distinct f.stage::text), count(*),
           array_agg(m.id order by m.id) filter (where m.id is not null), min(m.lock_at)
      into v_stages, v_fixture_count, v_markets, v_lock
      from public.fixtures f
      left join public.betting_markets m on m.fixture_id = f.id
     where f.season = v_event.schedule_season
       and (f.scheduled_at at time zone 'America/New_York')::date = p_target_monday;
    if v_fixture_count = 0 then
      raise exception 'no fixtures for % on %', v_event.name, p_target_monday;
    end if;
    if cardinality(v_stages) <> 1 then
      raise exception 'mixed fixture stages for % on %', v_event.name, p_target_monday;
    end if;
    if coalesce(cardinality(v_markets), 0) <> v_fixture_count then
      raise exception 'missing fixture markets for % on %', v_event.name, p_target_monday;
    end if;
    if exists (select 1 from public.betting_markets m join public.fixtures f on f.id=m.fixture_id
               where m.id = any(v_markets) and
                 (m.event_id <> v_event.id or m.draw_enabled or m.game_at is distinct from f.scheduled_at
                  or m.lock_at is distinct from f.scheduled_at)) then
      raise exception 'pick-em markets do not match the event and fixture kickoff';
    end if;
    -- Single-series playoff slates cannot form a pick'em.
    if v_fixture_count < 2 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_title := initcap(replace(v_stages[1], '_', ' '));
    select array_agg(p.id order by p.id) into v_ids
      from public.betting_pickems p
     where (p.event_id = v_event.id and p.title = v_title)
        or exists (select 1 from public.betting_pickem_legs l
                    where l.pickem_id=p.id and l.market_id=any(v_markets));
    if coalesce(cardinality(v_ids), 0) > 0 then
      if cardinality(v_ids) <> 1 then
        raise exception 'multiple pick-ems overlap % %', v_event.name, v_title;
      end if;
      select * into v_pickem from public.betting_pickems where id=v_ids[1] for update;
      if v_pickem.event_id is distinct from v_event.id
         or v_pickem.title is distinct from v_title
         or v_pickem.lock_at is distinct from v_lock
         or array(select market_id from public.betting_pickem_legs where pickem_id=v_pickem.id order by market_id)
            is distinct from v_markets then
        raise exception 'existing pick-em % does not match % % fixtures', v_pickem.id, v_event.name, v_title;
      end if;
      v_existing := v_existing + 1;
      continue;
    end if;
    if exists (select 1 from public.betting_markets where id=any(v_markets)
                and (status <> 'OPEN' or lock_at <= now())) then
      raise exception 'all pick-em legs must be OPEN and before kickoff';
    end if;
    -- Same atomic bank claim as create_pickem_admin, without impersonating an
    -- admin for a scheduled job. The cron result records created/existing totals.
    select balance into strict v_carry from public.betting_pickem_bank where id=1 for update;
    update public.betting_pickem_bank set balance=0 where id=1;
    insert into public.betting_pickems(event_id,title,carryover,lock_at)
      values(v_event.id,v_title,v_carry,v_lock) returning * into v_pickem;
    insert into public.betting_pickem_legs(pickem_id,market_id)
      select v_pickem.id, unnest(v_markets);
    v_created := v_created + 1;
  end loop;
  if v_created + v_existing + v_skipped <> 2 then
    raise exception 'pick-ems require exactly one current event per league';
  end if;
  return jsonb_build_object('created',v_created,'existing',v_existing,'skipped',v_skipped);
end;
$$;
revoke execute on function public.ensure_weekly_betting_pickems(date) from public, anon, authenticated;
grant execute on function public.ensure_weekly_betting_pickems(date) to service_role;

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
  v_pickems jsonb;
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

  v_pickems := public.ensure_weekly_betting_pickems(v_target_monday);

  return jsonb_build_object(
    'status', 'created',
    'target_monday', v_target_monday,
    'candidates', v_candidates,
    'created', v_created,
    'existing', v_existing,
    'pickems', v_pickems
  );
end;
$$;
