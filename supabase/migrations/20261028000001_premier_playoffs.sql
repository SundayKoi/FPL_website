-- Premier S5 playoffs: frozen seeds, stable fixture slots and guarded
-- advancement. The schedule remains the source of truth for every match.

do $$
declare
  v_duplicates text;
begin
  select string_agg(format('%s/%s/%s (%s rows)', season, stage, sort_order, n), ', ')
    into v_duplicates
  from (
    select season, stage, sort_order, count(*) as n
      from public.fixtures
     where stage in ('quarterfinals', 'semifinals', 'finals')
     group by season, stage, sort_order
    having count(*) > 1
  ) duplicate_slots;
  if v_duplicates is not null then
    raise exception 'Cannot add playoff slot uniqueness; resolve existing duplicate slots first: %', v_duplicates;
  end if;
end $$;

create unique index fixtures_playoff_slot_uidx
  on public.fixtures (season, stage, sort_order)
  where stage in ('quarterfinals', 'semifinals', 'finals');

create table public.premier_playoff_config (
  season text primary key,
  premier_draft_id uuid not null references public.drafts(id),
  pairing_22 text check (pairing_22 in ('solari_high_vs_lunari_low', 'solari_high_vs_lunari_high')),
  pairing_40 text check (pairing_40 in ('outer_seeds', 'adjacent_seeds')),
  config_version integer not null default 1 check (config_version > 0),
  updated_at timestamptz not null default now()
);

create table public.premier_playoff_entrants (
  season text not null references public.premier_playoff_config(season) on delete cascade,
  team_id uuid not null references public.league_teams(id) on delete restrict,
  canonical_name text not null,
  division text not null check (division in ('Solari', 'Lunari')),
  seed smallint not null check (seed between 1 and 4),
  primary key (season, team_id),
  unique (season, division, seed),
  unique (season, canonical_name)
);

alter table public.premier_playoff_config enable row level security;
alter table public.premier_playoff_entrants enable row level security;
create policy premier_playoff_config_read on public.premier_playoff_config for select using (true);
create policy premier_playoff_entrants_read on public.premier_playoff_entrants for select using (true);
revoke all on public.premier_playoff_config, public.premier_playoff_entrants from public, anon, authenticated;
grant select on public.premier_playoff_config, public.premier_playoff_entrants to anon, authenticated;
grant all on public.premier_playoff_config, public.premier_playoff_entrants to service_role;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- A participant change is only safe before anyone has built work around the
-- matchup. Keep this guard below the RPC too, so direct admin edits cannot
-- detach or repurpose a played playoff series.
create or replace function private.guard_playoff_fixture_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stage in ('quarterfinals', 'semifinals', 'finals')
     and (new.team_a is distinct from old.team_a or new.team_b is distinct from old.team_b)
     and (
       old.score_a is not null
       or old.score_b is not null
       or exists (select 1 from public.match_reports r where r.fixture_id = old.id)
       or exists (select 1 from public.match_codes c where c.fixture_id = old.id)
       or exists (select 1 from public.match_drafts d where d.fixture_id = old.id)
       or exists (select 1 from public.match_draft_settings s where s.fixture_id = old.id)
       or exists (select 1 from public.betting_markets m where m.fixture_id = old.id)
       or exists (select 1 from public.homepage_featured_settings h where h.fixture_id = old.id)
     ) then
    raise exception 'PLAYOFF_FIXTURE_PROTECTED: participants cannot be reassigned after scores or dependent work exist';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_playoff_fixture_participants on public.fixtures;
create trigger guard_playoff_fixture_participants
before update of team_a, team_b on public.fixtures
for each row execute function private.guard_playoff_fixture_participants();

-- Build a stable, complete view of all evidence for one fixture. The publish
-- RPC compares this JSON value with the admin's preview while holding row
-- locks, so a changed score/report makes the preview stale.
create or replace function private.playoff_source_snapshot(p_fixture_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'fixture', (
      select jsonb_build_object(
        'id', f.id,
        'season', f.season,
        'stage', f.stage::text,
        'sort_order', f.sort_order,
        'team_a', f.team_a,
        'team_b', f.team_b,
        'best_of', f.best_of,
        'score_a', f.score_a,
        'score_b', f.score_b
      )
      from public.fixtures f where f.id = p_fixture_id
    ),
    'reports', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'fixture_id', r.fixture_id,
          'season', r.season,
          'season_phase', r.season_phase,
          'team_a_id', r.team_a_id,
          'team_b_id', r.team_b_id,
          'score_a', r.score_a,
          'score_b', r.score_b,
          'status', r.status,
          'submitted_at', r.submitted_at,
          'forfeit_team_id', r.forfeit_team_id,
          'games', coalesce(g.games, '[]'::jsonb)
        ) order by r.id
      )
      from public.match_reports r
      left join lateral (
        select jsonb_agg(jsonb_build_object('id', rg.id, 'game_number', rg.game_number, 'status', rg.status) order by rg.game_number, rg.id) as games
        from public.match_report_games rg where rg.report_id = r.id
      ) g on true
      where r.fixture_id = p_fixture_id
    ), '[]'::jsonb)
  )
$$;

create or replace function private.assert_playoff_operator()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
begin
  if v_role <> 'service_role' and not public.is_admin() and not public.is_owner() then
    raise exception 'NOT_AUTHORIZED: playoff administration requires admin or owner access';
  end if;
end;
$$;

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

  -- Resolve each name through both the selected draft and the exact season.
  -- This rejects historical league_teams rows and ambiguous near-matches.
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
    select count(distinct lt.id), (array_agg(distinct lt.id order by lt.id))[1], min(lt.name)
      into v_count, v_id, v_a
      from public.teams t
      join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
      join public.roster_memberships rm on rm.league_team_id = lt.id and rm.season = p_season
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
        select (array_agg(distinct lt.id order by lt.id))[1] as team_id, min(lt.name) as canonical_name
          from public.teams t
          join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
          join public.roster_memberships rm on rm.league_team_id = lt.id and rm.season = p_season
         where t.draft_id = p_draft_id and lower(trim(t.name)) = lower(trim(input.name))
      ) resolved;
  elsif exists (
    select 1 from jsonb_to_recordset(p_entrants) as input(name text, division text, seed integer)
    where not exists (
      select 1 from public.premier_playoff_entrants e
      join public.teams t on t.draft_id = p_draft_id and lower(trim(t.name)) = lower(trim(input.name))
      where e.season = p_season and e.team_id = (
        select (array_agg(distinct lt.id order by lt.id))[1] from public.league_teams lt
        join public.roster_memberships rm on rm.league_team_id = lt.id and rm.season = p_season
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

create or replace function private.resolve_premier_playoff_result(p_fixture_id uuid, p_season text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fixture public.fixtures%rowtype;
  v_a public.premier_playoff_entrants%rowtype;
  v_b public.premier_playoff_entrants%rowtype;
  v_report record;
  v_report_a integer;
  v_report_b integer;
  v_report_winner uuid;
  v_report_count integer := 0;
  v_provisional boolean := false;
  v_official_valid boolean := false;
  v_report_score_a integer;
  v_report_score_b integer;
  v_issues text[] := array[]::text[];
  v_source text;
  v_winner uuid;
  v_score_a integer;
  v_score_b integer;
begin
  select * into v_fixture from public.fixtures f where f.id = p_fixture_id;
  if not found or v_fixture.season <> p_season or v_fixture.stage not in ('quarterfinals', 'semifinals') then
    return jsonb_build_object('status', 'blocked', 'blocking_reason', 'Source fixture is missing or is outside the configured playoff round.');
  end if;
  if v_fixture.best_of <> 5 then
    return jsonb_build_object('status', 'blocked', 'blocking_reason', 'Source fixture is not a best-of-five.');
  end if;
  if v_fixture.team_a is null or v_fixture.team_b is null or lower(trim(v_fixture.team_a)) = lower(trim(v_fixture.team_b)) then
    return jsonb_build_object('status', 'blocked', 'blocking_reason', 'Source fixture needs two distinct named participants.');
  end if;
  select * into v_a from public.premier_playoff_entrants e
   where e.season = p_season and lower(trim(e.canonical_name)) = lower(trim(v_fixture.team_a));
  select * into v_b from public.premier_playoff_entrants e
   where e.season = p_season and lower(trim(e.canonical_name)) = lower(trim(v_fixture.team_b));
  if v_a.team_id is null or v_b.team_id is null or v_a.team_id = v_b.team_id then
    return jsonb_build_object('status', 'blocked', 'blocking_reason', 'Fixture participants do not map to distinct frozen seeds.');
  end if;

  v_official_valid := (v_fixture.score_a = 3 and v_fixture.score_b between 0 and 2)
                   or (v_fixture.score_b = 3 and v_fixture.score_a between 0 and 2);

  for v_report in
    select r.*,
      coalesce(g.has_failed, false) as has_failed_game,
      coalesce(g.has_pending, false) as has_unresolved_game
    from public.match_reports r
    left join lateral (
      select bool_or(rg.status = 'failed') as has_failed,
             bool_or(rg.status in ('pending', 'needs_side')) as has_pending
        from public.match_report_games rg where rg.report_id = r.id
    ) g on true
    where r.fixture_id = p_fixture_id
    order by r.id
  loop
    if v_report.season <> p_season or lower(v_report.season_phase) <> 'playoffs' then
      v_issues := array_append(v_issues, format('Report %s has the wrong season or phase.', v_report.id));
      continue;
    end if;
    if v_report.team_a_id = v_a.team_id and v_report.team_b_id = v_b.team_id then
      v_report_a := v_report.score_a;
      v_report_b := v_report.score_b;
    elsif v_report.team_a_id = v_b.team_id and v_report.team_b_id = v_a.team_id then
      v_report_a := v_report.score_b;
      v_report_b := v_report.score_a;
    else
      v_issues := array_append(v_issues, format('Report %s names different participants.', v_report.id));
      continue;
    end if;
    if v_report.status = 'failed' or v_report.has_failed_game then
      v_issues := array_append(v_issues, format('Report %s failed and cannot supply a result.', v_report.id));
      continue;
    end if;
    if not ((v_report_a = 3 and v_report_b between 0 and 2) or (v_report_b = 3 and v_report_a between 0 and 2)) then
      v_issues := array_append(v_issues, format('Report %s does not contain a complete Bo5 score.', v_report.id));
      continue;
    end if;
    v_report_winner := case when v_report_a = 3 then v_a.team_id else v_b.team_id end;
    if v_report.forfeit_team_id is not null and v_report.forfeit_team_id <> (case when v_report_winner = v_a.team_id then v_b.team_id else v_a.team_id end) then
      v_issues := array_append(v_issues, format('Report %s names a forfeit side that did not lose.', v_report.id));
      continue;
    end if;
    if v_report.status not in ('pending', 'needs_sides', 'ingested', 'forfeit') then
      v_issues := array_append(v_issues, format('Report %s has an unsupported status.', v_report.id));
      continue;
    end if;
    if v_report.status = 'forfeit' and v_report.forfeit_team_id is null then
      v_issues := array_append(v_issues, format('Forfeit report %s does not name the conceding team.', v_report.id));
      continue;
    end if;
    if v_report_count = 0 then
      v_report_score_a := v_report_a;
      v_report_score_b := v_report_b;
    elsif v_report_score_a <> v_report_a or v_report_score_b <> v_report_b then
      return jsonb_build_object('status', 'blocked', 'blocking_reason', 'Usable reports conflict; staff must resolve the series before advancing.');
    end if;
    v_report_count := v_report_count + 1;
    v_provisional := v_provisional or v_report.status in ('pending', 'needs_sides') or v_report.has_unresolved_game;
  end loop;

  if v_official_valid then
    if v_report_count > 0 and (v_report_score_a <> v_fixture.score_a or v_report_score_b <> v_fixture.score_b) then
      return jsonb_build_object('status', 'blocked', 'blocking_reason', 'A usable report disagrees with the official fixture score.');
    end if;
    v_source := 'fixture_score';
    v_score_a := v_fixture.score_a;
    v_score_b := v_fixture.score_b;
    v_winner := case when v_score_a = 3 then v_a.team_id else v_b.team_id end;
  elsif v_report_count > 0 then
    v_source := 'report';
    v_score_a := v_report_score_a;
    v_score_b := v_report_score_b;
    v_winner := case when v_score_a = 3 then v_a.team_id else v_b.team_id end;
  else
    return jsonb_build_object(
      'status', 'blocked',
      'blocking_reason', coalesce(v_issues[1], 'The series has no complete official score or usable report.'),
      'warnings', to_jsonb(v_issues)
    );
  end if;
  return jsonb_build_object(
    'status', 'ready', 'winner_team_id', v_winner,
    'winner_name', (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = v_winner),
    'score_a', v_score_a, 'score_b', v_score_b, 'source', v_source,
    'provisional', case when v_source = 'report' then v_provisional else false end,
    'report_ids', coalesce((select jsonb_agg(r.id order by r.id) from public.match_reports r where r.fixture_id = p_fixture_id), '[]'::jsonb),
    'warnings', to_jsonb(v_issues)
  );
end;
$$;

create or replace function private.premier_playoff_has_dependents(p_fixture_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.match_reports r where r.fixture_id = p_fixture_id)
      or exists (select 1 from public.match_codes c where c.fixture_id = p_fixture_id)
      or exists (select 1 from public.match_drafts d where d.fixture_id = p_fixture_id)
      or exists (select 1 from public.match_draft_settings s where s.fixture_id = p_fixture_id)
      or exists (select 1 from public.betting_markets m where m.fixture_id = p_fixture_id)
      or exists (select 1 from public.homepage_featured_settings h where h.fixture_id = p_fixture_id)
$$;

create or replace function private.update_premier_playoff_policy(
  p_season text,
  p_pairing_22 text,
  p_pairing_40 text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not public.is_admin() and not public.is_owner() then
    raise exception 'NOT_AUTHORIZED: playoff pairing policy requires admin or owner access';
  end if;
  perform 1 from public.premier_playoff_config c where c.season = p_season for update;
  if not found then raise exception 'PLAYOFF_CONFIG_MISSING: initialize the playoff bracket first'; end if;
  if p_pairing_22 is not null and p_pairing_22 not in ('solari_high_vs_lunari_low', 'solari_high_vs_lunari_high') then
    raise exception 'PLAYOFF_POLICY_INVALID: unsupported 2/2 semifinal policy';
  end if;
  if p_pairing_40 is not null and p_pairing_40 not in ('outer_seeds', 'adjacent_seeds') then
    raise exception 'PLAYOFF_POLICY_INVALID: unsupported 4/0 semifinal policy';
  end if;
  if exists (
    select 1 from public.fixtures f
     where f.season = p_season and f.stage = 'semifinals'
       and (f.team_a is not null or f.team_b is not null)
  ) then
    raise exception 'PLAYOFF_POLICY_LOCKED: semifinal matchups have already been published';
  end if;
  update public.premier_playoff_config c
     set pairing_22 = p_pairing_22,
         pairing_40 = p_pairing_40,
         config_version = c.config_version + 1,
         updated_at = now()
   where c.season = p_season
     and (c.pairing_22 is distinct from p_pairing_22 or c.pairing_40 is distinct from p_pairing_40)
  returning config_version into v_version;
  if v_version is null then
    select c.config_version into v_version from public.premier_playoff_config c where c.season = p_season;
  end if;
  if v_version is null then raise exception 'PLAYOFF_CONFIG_MISSING: initialize the playoff bracket first'; end if;
  return v_version;
end;
$$;

create or replace function private.publish_premier_playoff_round(
  p_season text,
  p_stage text,
  p_preview jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_config public.premier_playoff_config%rowtype;
  v_source_stage public.fixture_stage;
  v_source_count integer;
  v_target_count integer;
  v_snapshot jsonb;
  v_current_target_ids jsonb;
  v_expected_pairs jsonb := '[]'::jsonb;
  v_target_ids uuid[];
  v_winners uuid[] := array[]::uuid[];
  v_solari uuid[] := array[]::uuid[];
  v_lunari uuid[] := array[]::uuid[];
  v_target record;
  v_source record;
  v_result jsonb;
  v_pair jsonb;
  v_changed integer := 0;
  v_version integer;
begin
  if not public.is_admin() and not public.is_owner() then
    raise exception 'NOT_AUTHORIZED: publishing playoff advancement requires admin or owner access';
  end if;
  if p_stage not in ('semifinals', 'finals') then
    raise exception 'PLAYOFF_STAGE_INVALID: only semifinals and finals can be advanced';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('premier-playoffs:' || p_season, 0));
  select * into v_config from public.premier_playoff_config c where c.season = p_season for update;
  if not found then raise exception 'PLAYOFF_CONFIG_MISSING: initialize the Premier bracket first'; end if;
  if (p_preview->>'config_version')::integer is distinct from v_config.config_version then
    raise exception 'PLAYOFF_PREVIEW_STALE: the pairing policy changed after this preview';
  end if;
  v_source_stage := case when p_stage = 'semifinals' then 'quarterfinals'::public.fixture_stage else 'semifinals'::public.fixture_stage end;
  v_source_count := case when p_stage = 'semifinals' then 4 else 2 end;
  v_target_count := case when p_stage = 'semifinals' then 2 else 1 end;
  if (select count(*) from public.fixtures f where f.season = p_season and f.stage = v_source_stage) <> v_source_count then
    raise exception 'PLAYOFF_SOURCE_MISSING: expected % % source fixtures', v_source_count, v_source_stage;
  end if;
  if (select count(*) from public.fixtures f where f.season = p_season and f.stage::text = p_stage) <> v_target_count then
    raise exception 'PLAYOFF_TARGET_MISSING: expected % existing % slot(s)', v_target_count, p_stage;
  end if;

  perform 1 from public.fixtures f
   where f.season = p_season and f.stage in (v_source_stage, p_stage::public.fixture_stage)
   order by f.id for update;
  perform 1 from public.match_reports r
   where r.fixture_id in (select f.id from public.fixtures f where f.season = p_season and f.stage = v_source_stage)
   order by r.id for update;
  perform 1 from public.match_report_games g
   where g.report_id in (
     select r.id from public.match_reports r
      where r.fixture_id in (select f.id from public.fixtures f where f.season = p_season and f.stage = v_source_stage)
   ) order by g.id for update;

  select coalesce(jsonb_agg(private.playoff_source_snapshot(f.id) order by f.sort_order), '[]'::jsonb)
    into v_snapshot
    from public.fixtures f where f.season = p_season and f.stage = v_source_stage;
  if p_preview->'source_snapshots' is distinct from v_snapshot then
    raise exception 'PLAYOFF_PREVIEW_STALE: fixture or report evidence changed after this preview';
  end if;
  select coalesce(jsonb_agg(f.id::text order by f.sort_order), '[]'::jsonb)
    into v_current_target_ids
    from public.fixtures f where f.season = p_season and f.stage::text = p_stage;
  if p_preview->'target_fixture_ids' is distinct from v_current_target_ids then
    raise exception 'PLAYOFF_PREVIEW_STALE: target fixture slots changed after this preview';
  end if;

  for v_source in
    select f.id, f.sort_order from public.fixtures f
     where f.season = p_season and f.stage = v_source_stage order by f.sort_order
  loop
    v_result := private.resolve_premier_playoff_result(v_source.id, p_season);
    if v_result->>'status' <> 'ready' then
      raise exception 'PLAYOFF_RESULT_BLOCKED: %', coalesce(v_result->>'blocking_reason', 'source result is unresolved');
    end if;
    v_winners := array_append(v_winners, (v_result->>'winner_team_id')::uuid);
  end loop;

  if p_stage = 'finals' then
    if cardinality(v_winners) <> 2 or v_winners[1] = v_winners[2] then
      raise exception 'PLAYOFF_RESULT_BLOCKED: two distinct semifinal winners are required';
    end if;
    v_expected_pairs := jsonb_build_array(jsonb_build_object(
      'sort_order', 0, 'team_a_id', v_winners[1]::text, 'team_b_id', v_winners[2]::text
    ));
  else
    select coalesce(array_agg(e.team_id order by e.seed), array[]::uuid[]) into v_solari
      from public.premier_playoff_entrants e where e.season = p_season and e.division = 'Solari' and e.team_id = any(v_winners);
    select coalesce(array_agg(e.team_id order by e.seed), array[]::uuid[]) into v_lunari
      from public.premier_playoff_entrants e where e.season = p_season and e.division = 'Lunari' and e.team_id = any(v_winners);
    if cardinality(v_winners) <> 4 or cardinality(array(select distinct unnest(v_winners))) <> 4 then
      raise exception 'PLAYOFF_RESULT_BLOCKED: four distinct quarterfinal winners are required';
    end if;
    if cardinality(v_solari) = 2 and cardinality(v_lunari) = 2 then
      if v_config.pairing_22 is null then raise exception 'PLAYOFF_POLICY_REQUIRED: confirm the 2/2 cross-division semifinal draw'; end if;
      if v_config.pairing_22 = 'solari_high_vs_lunari_low' then
        v_expected_pairs := jsonb_build_array(
          jsonb_build_object('sort_order', 0, 'team_a_id', v_solari[1]::text, 'team_b_id', v_lunari[2]::text),
          jsonb_build_object('sort_order', 1, 'team_a_id', v_lunari[1]::text, 'team_b_id', v_solari[2]::text)
        );
      else
        v_expected_pairs := jsonb_build_array(
          jsonb_build_object('sort_order', 0, 'team_a_id', v_solari[1]::text, 'team_b_id', v_lunari[1]::text),
          jsonb_build_object('sort_order', 1, 'team_a_id', v_solari[2]::text, 'team_b_id', v_lunari[2]::text)
        );
      end if;
    elsif cardinality(v_solari) = 3 and cardinality(v_lunari) = 1 then
      v_expected_pairs := jsonb_build_array(
        jsonb_build_object('sort_order', 0, 'team_a_id', v_solari[1]::text, 'team_b_id', v_solari[3]::text),
        jsonb_build_object('sort_order', 1, 'team_a_id', v_solari[2]::text, 'team_b_id', v_lunari[1]::text)
      );
    elsif cardinality(v_solari) = 1 and cardinality(v_lunari) = 3 then
      v_expected_pairs := jsonb_build_array(
        jsonb_build_object('sort_order', 0, 'team_a_id', v_lunari[1]::text, 'team_b_id', v_lunari[3]::text),
        jsonb_build_object('sort_order', 1, 'team_a_id', v_lunari[2]::text, 'team_b_id', v_solari[1]::text)
      );
    elsif cardinality(v_solari) = 4 or cardinality(v_lunari) = 4 then
      if v_config.pairing_40 is null then raise exception 'PLAYOFF_POLICY_REQUIRED: all four survivors share one division; a league ruling is required'; end if;
      if cardinality(v_solari) = 4 then
        if v_config.pairing_40 = 'outer_seeds' then
          v_expected_pairs := jsonb_build_array(
            jsonb_build_object('sort_order', 0, 'team_a_id', v_solari[1]::text, 'team_b_id', v_solari[4]::text),
            jsonb_build_object('sort_order', 1, 'team_a_id', v_solari[2]::text, 'team_b_id', v_solari[3]::text)
          );
        else
          v_expected_pairs := jsonb_build_array(
            jsonb_build_object('sort_order', 0, 'team_a_id', v_solari[1]::text, 'team_b_id', v_solari[2]::text),
            jsonb_build_object('sort_order', 1, 'team_a_id', v_solari[3]::text, 'team_b_id', v_solari[4]::text)
          );
        end if;
      else
        if v_config.pairing_40 = 'outer_seeds' then
          v_expected_pairs := jsonb_build_array(
            jsonb_build_object('sort_order', 0, 'team_a_id', v_lunari[1]::text, 'team_b_id', v_lunari[4]::text),
            jsonb_build_object('sort_order', 1, 'team_a_id', v_lunari[2]::text, 'team_b_id', v_lunari[3]::text)
          );
        else
          v_expected_pairs := jsonb_build_array(
            jsonb_build_object('sort_order', 0, 'team_a_id', v_lunari[1]::text, 'team_b_id', v_lunari[2]::text),
            jsonb_build_object('sort_order', 1, 'team_a_id', v_lunari[3]::text, 'team_b_id', v_lunari[4]::text)
          );
        end if;
      end if;
    else
      raise exception 'PLAYOFF_PAIRING_UNSUPPORTED: the division split has no documented semifinal pairing';
    end if;
  end if;

  if p_preview->'matches' is distinct from v_expected_pairs then
    raise exception 'PLAYOFF_PREVIEW_STALE: proposed pairings do not match the frozen seeds and stored policy';
  end if;
  for v_target in
    select f.id, f.sort_order, f.team_a, f.team_b, f.score_a, f.score_b
      from public.fixtures f where f.season = p_season and f.stage::text = p_stage
     order by f.sort_order for update
  loop
    v_pair := v_expected_pairs->v_target.sort_order;
    if private.premier_playoff_has_dependents(v_target.id)
       and (v_target.team_a is distinct from (
         select e.canonical_name from public.premier_playoff_entrants e
         where e.season = p_season and e.team_id = (v_pair->>'team_a_id')::uuid
       ) or v_target.team_b is distinct from (
         select e.canonical_name from public.premier_playoff_entrants e
         where e.season = p_season and e.team_id = (v_pair->>'team_b_id')::uuid
       )) then
      raise exception 'PLAYOFF_FIXTURE_PROTECTED: % #% has dependent work and cannot be reassigned', p_stage, v_target.sort_order;
    end if;
    if (v_target.score_a is not null or v_target.score_b is not null)
       and (v_target.team_a is distinct from (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_a_id')::uuid)
         or v_target.team_b is distinct from (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_b_id')::uuid)) then
      raise exception 'PLAYOFF_FIXTURE_PROTECTED: scored % #% cannot be reassigned', p_stage, v_target.sort_order;
    end if;
    update public.fixtures f set
      team_a = (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_a_id')::uuid),
      team_b = (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_b_id')::uuid),
      division = null
     where f.id = v_target.id
       and (f.team_a is distinct from (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_a_id')::uuid)
         or f.team_b is distinct from (select e.canonical_name from public.premier_playoff_entrants e where e.season = p_season and e.team_id = (v_pair->>'team_b_id')::uuid)
         or f.division is not null);
    get diagnostics v_version = row_count;
    v_changed := v_changed + v_version;
  end loop;
  return jsonb_build_object(
    'season', p_season, 'stage', p_stage, 'changed', v_changed > 0,
    'updated', v_changed, 'config_version', v_config.config_version,
    'matches', v_expected_pairs, 'target_fixture_ids', v_current_target_ids
  );
end;
$$;

-- PostgREST-facing wrappers are invoker functions. All writes live in the
-- private, authorization-checking definer routines above.
create or replace function public.initialize_premier_playoffs(
  p_season text,
  p_draft_id uuid,
  p_entrants jsonb,
  p_fixtures jsonb,
  p_policy jsonb default '{}'::jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.initialize_premier_playoffs(p_season, p_draft_id, p_entrants, p_fixtures, p_policy)
$$;

create or replace function public.update_premier_playoff_policy(
  p_season text,
  p_pairing_22 text,
  p_pairing_40 text
) returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.update_premier_playoff_policy(p_season, p_pairing_22, p_pairing_40)
$$;

create or replace function public.publish_premier_playoff_round(
  p_season text,
  p_stage text,
  p_preview jsonb
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.publish_premier_playoff_round(p_season, p_stage, p_preview)
$$;

revoke all on function private.initialize_premier_playoffs(text, uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function private.update_premier_playoff_policy(text, text, text) from public, anon;
revoke all on function private.publish_premier_playoff_round(text, text, jsonb) from public, anon;
grant execute on function private.initialize_premier_playoffs(text, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function private.update_premier_playoff_policy(text, text, text) to authenticated;
grant execute on function private.publish_premier_playoff_round(text, text, jsonb) to authenticated;

revoke all on function public.initialize_premier_playoffs(text, uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.update_premier_playoff_policy(text, text, text) from public, anon;
revoke all on function public.publish_premier_playoff_round(text, text, jsonb) from public, anon;
grant execute on function public.initialize_premier_playoffs(text, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.update_premier_playoff_policy(text, text, text) to authenticated;
grant execute on function public.publish_premier_playoff_round(text, text, jsonb) to authenticated;

comment on table public.premier_playoff_config is
  'Season-scoped Premier playoff draft and explicitly approved tie-break policies. config_version invalidates stale previews.';
comment on table public.premier_playoff_entrants is
  'Frozen playoff division/seed assignments resolved from the selected Premier draft and season.';
comment on function public.publish_premier_playoff_round(text, text, jsonb) is
  'Atomically revalidates result evidence and pairing policy under row locks, then fills existing playoff fixture slots.';
