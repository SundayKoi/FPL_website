-- Resolve Premier entrants from the selected draft and canonical team list.
-- Riot account roster memberships are optional and can be empty for a season.

create or replace function private.initialize_premier_playoffs(
  p_season text,
  p_draft_id uuid,
  p_entrants jsonb,
  p_fixtures jsonb,
  p_policy jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting record;
  v_entrant record;
  v_fixture record;
  v_existing public.fixtures%rowtype;
  v_id uuid;
  v_count integer;
  v_a text;
  v_b text;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_seeded_names text[] := array[]::text[];
begin
  perform private.assert_playoff_operator();

  if p_season is null or p_draft_id is null or jsonb_typeof(p_entrants) <> 'array' or jsonb_typeof(p_fixtures) <> 'array' then
    raise exception 'PLAYOFF_CONFIG_INVALID: season, draft, entrants and fixtures are required';
  end if;
  select current_season, featured_draft_id into v_setting
    from public.league_settings where id = 1 for update;
  if not found or v_setting.current_season is distinct from p_season or v_setting.featured_draft_id is distinct from p_draft_id then
    raise exception 'PLAYOFF_SCOPE_INVALID: initialization must use the selected Premier draft and current season';
  end if;
  if jsonb_array_length(p_entrants) <> 8 then
    raise exception 'PLAYOFF_ENTRANTS_INVALID: exactly eight frozen entrants are required';
  end if;
  if jsonb_array_length(p_fixtures) <> 7 then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: exactly seven fixture slots are required';
  end if;
  if (select count(*) from jsonb_to_recordset(p_fixtures) as x(stage text, sort_order integer) where stage = 'quarterfinals') <> 4
     or (select count(*) from jsonb_to_recordset(p_fixtures) as x(stage text, sort_order integer) where stage = 'semifinals') <> 2
     or (select count(*) from jsonb_to_recordset(p_fixtures) as x(stage text, sort_order integer) where stage = 'finals') <> 1 then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: expected four quarterfinals, two semifinals and one final';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, sort_order integer)
    group by stage, sort_order having count(*) > 1
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: the bracket file contains duplicate slots';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, sort_order integer)
    group by stage
    having min(sort_order) <> 0 or max(sort_order) <> count(*) - 1
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: each playoff stage must use contiguous sort_order slots starting at zero';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, best_of integer)
    where stage not in ('quarterfinals', 'semifinals', 'finals') or best_of is distinct from 5
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: playoff slots must be best-of-five quarterfinal, semifinal or final rows';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, team_a text, team_b text)
    where team_a is not null and team_b is not null and lower(trim(team_a)) = lower(trim(team_b))
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: a fixture cannot name the same team twice';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, team_a text, team_b text)
    where (stage = 'quarterfinals' and (team_a is null or team_b is null))
       or (stage in ('semifinals', 'finals') and (team_a is not null or team_b is not null))
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: quarterfinals need named teams; later rounds must start as unresolved slots';
  end if;

  -- The selected Premier draft and current season are checked above.
  -- Resolve canonical team names without requiring optional Riot account memberships.
  for v_entrant in
    select * from jsonb_to_recordset(p_entrants) as x(name text, division text, seed integer)
  loop
    if v_entrant.name is null or trim(v_entrant.name) = '' or v_entrant.division not in ('Solari', 'Lunari') or v_entrant.seed not between 1 and 4 then
      raise exception 'PLAYOFF_ENTRANTS_INVALID: every entrant needs a canonical name, division and seed 1 through 4';
    end if;
    if lower(trim(v_entrant.name)) = any(v_seeded_names) then
      raise exception 'PLAYOFF_ENTRANTS_INVALID: duplicate entrant name %', v_entrant.name;
    end if;
    v_seeded_names := array_append(v_seeded_names, lower(trim(v_entrant.name)));
    select count(*), (array_agg(lt.id order by lt.id))[1], min(lt.name)
      into v_count, v_id, v_a
      from public.teams t
      join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
     where t.draft_id = p_draft_id and lower(trim(t.name)) = lower(trim(v_entrant.name));
    if v_count <> 1 then
      raise exception 'PLAYOFF_ENTRANT_UNKNOWN: % must resolve to exactly one team in the selected draft and season (found %)', v_entrant.name, v_count;
    end if;
  end loop;
  if cardinality(v_seeded_names) <> 8
     or (select count(distinct lower(trim(x.name))) from jsonb_to_recordset(p_entrants) as x(name text)) <> 8
     or (select count(*) from jsonb_to_recordset(p_entrants) as x(division text, seed integer) where division = 'Solari') <> 4
     or (select count(*) from jsonb_to_recordset(p_entrants) as x(division text, seed integer) where division = 'Lunari') <> 4
     or (select count(distinct division || ':' || seed::text) from jsonb_to_recordset(p_entrants) as x(division text, seed integer)) <> 8 then
    raise exception 'PLAYOFF_ENTRANTS_INVALID: entrants must be unique, with seeds one through four in each division';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_fixtures) as x(stage text, team_a text, team_b text)
    cross join lateral (values (x.team_a), (x.team_b)) as side(name)
    where side.name is not null and not exists (
      select 1 from jsonb_to_recordset(p_entrants) as e(name text)
      where lower(trim(e.name)) = lower(trim(side.name))
    )
  ) then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: a quarterfinal participant is not a frozen entrant';
  end if;
  if (select count(distinct lower(trim(side.name)))
        from jsonb_to_recordset(p_fixtures) as x(stage text, team_a text, team_b text)
        cross join lateral (values (x.team_a), (x.team_b)) as side(name)
       where x.stage = 'quarterfinals') <> 8 then
    raise exception 'PLAYOFF_SCHEDULE_INVALID: all eight frozen entrants must appear exactly once in the quarterfinals';
  end if;

  perform 1 from public.fixtures f where f.season = p_season and f.stage in ('quarterfinals', 'semifinals', 'finals') order by f.id for update;
  if exists (
    select 1 from public.fixtures f where f.season = p_season and f.stage in ('quarterfinals', 'semifinals', 'finals')
    group by f.stage, f.sort_order having count(*) > 1
  ) then
    raise exception 'PLAYOFF_SLOT_DUPLICATE: existing playoff rows contain duplicate slots for season %', p_season;
  end if;

  insert into public.premier_playoff_config (season, premier_draft_id, pairing_22, pairing_40)
  values (p_season, p_draft_id, p_policy->>'pairing_22', p_policy->>'pairing_40')
  on conflict (season) do nothing;
  if not exists (select 1 from public.premier_playoff_config c where c.season = p_season and c.premier_draft_id = p_draft_id) then
    raise exception 'PLAYOFF_CONFIG_FROZEN: this season is already pinned to a different Premier draft';
  end if;

  if not exists (select 1 from public.premier_playoff_entrants e where e.season = p_season) then
    insert into public.premier_playoff_entrants (season, team_id, canonical_name, division, seed)
    select p_season, resolved.team_id, resolved.canonical_name, input.division, input.seed
      from jsonb_to_recordset(p_entrants) as input(name text, division text, seed integer)
      cross join lateral (
        select (array_agg(lt.id order by lt.id))[1] as team_id, min(lt.name) as canonical_name
          from public.teams t
          join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
         where t.draft_id = p_draft_id and lower(trim(t.name)) = lower(trim(input.name))
      ) resolved;
  elsif exists (
    select 1 from jsonb_to_recordset(p_entrants) as input(name text, division text, seed integer)
    where not exists (
      select 1 from public.premier_playoff_entrants e
      join public.teams t on t.draft_id = p_draft_id and lower(trim(t.name)) = lower(trim(input.name))
      where e.season = p_season and e.team_id = (
        select (array_agg(lt.id order by lt.id))[1] from public.league_teams lt
        where lower(trim(lt.name)) = lower(trim(input.name))
      ) and e.canonical_name = (select min(lt.name) from public.league_teams lt where lower(trim(lt.name)) = lower(trim(input.name)))
        and e.division = input.division and e.seed = input.seed
    )
  ) or (select count(*) from public.premier_playoff_entrants e where e.season = p_season) <> 8 then
    raise exception 'PLAYOFF_ENTRANTS_FROZEN: published seed assignments cannot be changed by reinitialization';
  end if;

  for v_fixture in
    select * from jsonb_to_recordset(p_fixtures) as x(
      stage text, sort_order integer, team_a text, team_b text,
      best_of integer, scheduled_at timestamptz
    ) order by stage, sort_order
  loop
    v_a := null;
    v_b := null;
    if v_fixture.team_a is not null then
      select canonical_name into v_a from public.premier_playoff_entrants
       where season = p_season and lower(trim(canonical_name)) = lower(trim(v_fixture.team_a));
    end if;
    if v_fixture.team_b is not null then
      select canonical_name into v_b from public.premier_playoff_entrants
       where season = p_season and lower(trim(canonical_name)) = lower(trim(v_fixture.team_b));
    end if;

    select * into v_existing from public.fixtures f
     where f.season = p_season and f.stage::text = v_fixture.stage and f.sort_order = v_fixture.sort_order;
    if found then
      -- File nulls are only initialization placeholders. They never erase a
      -- semifinal/final already filled by the atomic advancement operation.
      if v_fixture.stage in ('semifinals', 'finals') then
        v_a := coalesce(v_existing.team_a, v_a);
        v_b := coalesce(v_existing.team_b, v_b);
      end if;
      if v_existing.team_a is distinct from v_a or v_existing.team_b is distinct from v_b
         or v_existing.division is not null or v_existing.best_of is distinct from v_fixture.best_of
         or v_existing.scheduled_at is distinct from v_fixture.scheduled_at then
        if v_existing.score_a is not null or v_existing.score_b is not null
           or exists (select 1 from public.match_reports r where r.fixture_id = v_existing.id)
           or exists (select 1 from public.match_codes c where c.fixture_id = v_existing.id)
           or exists (select 1 from public.match_drafts d where d.fixture_id = v_existing.id)
           or exists (select 1 from public.match_draft_settings s where s.fixture_id = v_existing.id)
           or exists (select 1 from public.betting_markets m where m.fixture_id = v_existing.id)
           or exists (select 1 from public.homepage_featured_settings h where h.fixture_id = v_existing.id) then
          raise exception 'PLAYOFF_FIXTURE_PROTECTED: % #% has dependent work; initialization will not reassign it', v_fixture.stage, v_fixture.sort_order;
        end if;
        update public.fixtures set team_a = v_a, team_b = v_b, division = null,
          best_of = v_fixture.best_of, scheduled_at = v_fixture.scheduled_at
         where id = v_existing.id;
        v_updated := v_updated + 1;
      else
        v_unchanged := v_unchanged + 1;
      end if;
    else
      insert into public.fixtures (season, stage, sort_order, division, team_a, team_b, best_of, scheduled_at)
      values (p_season, v_fixture.stage::public.fixture_stage, v_fixture.sort_order, null, v_a, v_b, v_fixture.best_of, v_fixture.scheduled_at);
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  return jsonb_build_object('season', p_season, 'inserted', v_inserted, 'updated', v_updated, 'unchanged', v_unchanged);
end;
$$;
