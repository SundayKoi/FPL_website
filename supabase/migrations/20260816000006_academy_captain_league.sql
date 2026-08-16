-- Academy captain league: keep the shared captain data model, but make every
-- league-facing record explicit about whether it belongs to Premier or Academy.

alter table public.league_settings
  add column if not exists academy_draft_id uuid references public.drafts(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'league_kind') then
    create type public.league_kind as enum ('premier', 'academy');
  end if;
end $$;

alter table public.league_teams add column if not exists league public.league_kind not null default 'premier';
alter table public.league_team_captains add column if not exists league public.league_kind not null default 'premier';
alter table public.fixtures add column if not exists league public.league_kind not null default 'premier';
alter table public.match_reports add column if not exists league public.league_kind not null default 'premier';
alter table public.match_codes add column if not exists league public.league_kind not null default 'premier';
alter table public.roster_memberships add column if not exists league public.league_kind not null default 'premier';
alter table public.announcements add column if not exists league public.league_kind not null default 'premier';
alter table public.raw_stats add column if not exists league public.league_kind not null default 'premier';

alter table public.league_teams drop constraint if exists league_teams_name_key;
alter table public.league_teams drop constraint if exists league_teams_abbreviation_key;
alter table public.league_teams add constraint league_teams_league_name_key unique (league, name);
alter table public.league_teams add constraint league_teams_league_abbreviation_key unique (league, abbreviation);

alter table public.roster_memberships drop constraint if exists roster_memberships_riot_account_id_season_key;
alter table public.roster_memberships add constraint roster_memberships_riot_account_season_league_key
  unique (riot_account_id, season, league);
alter table public.league_team_captains drop constraint if exists league_team_captains_league_team_id_season_profile_id_key;
alter table public.league_team_captains add constraint league_team_captains_scope_key
  unique (league_team_id, season, profile_id, league);

create index if not exists league_teams_league_active_idx on public.league_teams (league, active, name);
create index if not exists league_team_captains_scope_idx on public.league_team_captains (league, season, profile_id);
create index if not exists fixtures_scope_idx on public.fixtures (league, season, stage, sort_order);
create index if not exists match_reports_scope_idx on public.match_reports (league, season, submitted_at desc);
create index if not exists match_codes_scope_idx on public.match_codes (league, season, fixture_id);
create index if not exists roster_memberships_scope_idx on public.roster_memberships (league, season, league_team_id);
create index if not exists raw_stats_scope_idx on public.raw_stats (league, season, team_name);

create or replace function public.is_captain_of(
  p_league_team_id uuid,
  p_season text,
  p_league public.league_kind
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_team_captains
    where league_team_id = p_league_team_id
      and season = p_season
      and league = p_league
      and profile_id = auth.uid()
  )
$$;

drop policy if exists match_codes_select on public.match_codes;
create policy match_codes_select on public.match_codes for select
  using (public.is_admin()
    or public.is_captain_of(team_a_id, season, league)
    or public.is_captain_of(team_b_id, season, league));

drop policy if exists match_reports_public_read on public.match_reports;
create policy match_reports_captain_read on public.match_reports for select to authenticated
  using (public.is_admin()
    or public.is_captain_of(team_a_id, season, league)
    or public.is_captain_of(team_b_id, season, league));
drop policy if exists match_reports_insert on public.match_reports;
create policy match_reports_insert on public.match_reports for insert to authenticated
  with check (public.is_admin()
    or (public.is_captain_of(team_a_id, season, league)
      or public.is_captain_of(team_b_id, season, league)));

drop policy if exists match_report_games_public_read on public.match_report_games;
create policy match_report_games_captain_read on public.match_report_games for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.match_reports r
    where r.id = report_id
      and (public.is_captain_of(r.team_a_id, r.season, r.league)
        or public.is_captain_of(r.team_b_id, r.season, r.league))
  ));
drop policy if exists match_report_games_insert on public.match_report_games;
create policy match_report_games_insert on public.match_report_games for insert to authenticated
  with check (public.is_admin() or exists (
    select 1 from public.match_reports r
    where r.id = report_id
      and (public.is_captain_of(r.team_a_id, r.season, r.league)
        or public.is_captain_of(r.team_b_id, r.season, r.league))
  ));
drop policy if exists match_report_games_update on public.match_report_games;
create policy match_report_games_update on public.match_report_games for update to authenticated
  using (public.is_admin() or exists (
    select 1 from public.match_reports r
    where r.id = report_id and r.status <> 'ingested'
      and (public.is_captain_of(r.team_a_id, r.season, r.league)
        or public.is_captain_of(r.team_b_id, r.season, r.league))
  ))
  with check (public.is_admin() or exists (
    select 1 from public.match_reports r
    where r.id = report_id
      and (public.is_captain_of(r.team_a_id, r.season, r.league)
        or public.is_captain_of(r.team_b_id, r.season, r.league))
  ));

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.league_team_captains c
    where c.profile_id = auth.uid() and c.league = announcements.league
  ));

create or replace function public.sync_league_team_captains(
  p_season text,
  p_league public.league_kind
) returns int
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  perform public._require_admin();
  insert into public.league_team_captains (league_team_id, season, profile_id, league)
  select lt.id, p_season, t.captain_profile_id, p_league
  from public.teams t
  join public.league_teams lt
    on lower(trim(lt.name)) = lower(trim(t.name)) and lt.league = p_league
  where t.draft_id = (
    select case when p_league = 'academy' then academy_draft_id else featured_draft_id end
    from public.league_settings where id = 1
  )
    and t.captain_profile_id is not null
  on conflict (league_team_id, season, profile_id, league) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.sync_league_team_captains(text, public.league_kind) from public;
grant execute on function public.sync_league_team_captains(text, public.league_kind) to authenticated, service_role;

create or replace function public.sync_league_team_captains(p_season text) returns int
language sql security definer set search_path = public as $$
  select public.sync_league_team_captains(p_season, 'premier'::public.league_kind)
$$;
revoke all on function public.sync_league_team_captains(text) from public;
grant execute on function public.sync_league_team_captains(text) to authenticated, service_role;

create or replace function public.sync_league_teams_from_draft(p_league public.league_kind) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_abbr text;
  v_inserted int := 0;
begin
  perform public._require_admin();
  for r in
    select t.name, t.abbreviation
    from public.teams t
    where t.draft_id = (
      select case when p_league = 'academy' then academy_draft_id else featured_draft_id end
      from public.league_settings where id = 1
    )
      and not exists (
        select 1 from public.league_teams lt
        where lt.league = p_league and lower(trim(lt.name)) = lower(trim(t.name))
      )
  loop
    v_abbr := upper(left(regexp_replace(trim(coalesce(r.abbreviation, r.name)), '[^A-Za-z0-9]', '', 'g'), 5));
    if v_abbr = '' then v_abbr := 'TEAM'; end if;
    while exists (select 1 from public.league_teams where league = p_league and lower(abbreviation) = lower(v_abbr)) loop
      v_abbr := left(v_abbr, 4) || ((random() * 9)::int + 1)::text;
    end loop;
    insert into public.league_teams (name, abbreviation, league)
    values (trim(r.name), v_abbr, p_league);
    v_inserted := v_inserted + 1;
  end loop;
  return v_inserted;
end;
$$;
revoke all on function public.sync_league_teams_from_draft(public.league_kind) from public;
grant execute on function public.sync_league_teams_from_draft(public.league_kind) to authenticated, service_role;

create or replace function public.sync_league_teams_from_draft() returns int
language sql security definer set search_path = public as $$
  select public.sync_league_teams_from_draft('premier'::public.league_kind)
$$;
revoke all on function public.sync_league_teams_from_draft() from public;
grant execute on function public.sync_league_teams_from_draft() to authenticated, service_role;

create or replace function public.replace_match_codes(
  p_fixture_id uuid,
  p_season text,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_codes text[],
  p_league public.league_kind
) returns int
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  perform public._require_admin();
  delete from public.match_codes where fixture_id = p_fixture_id and league = p_league;
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code, created_by, league)
  select p_fixture_id, p_season, p_team_a_id, p_team_b_id, row_number() over (order by ord), trimmed, auth.uid(), p_league
  from (select ord, trim(code) as trimmed from unnest(p_codes) with ordinality as t(code, ord)) s
  where trimmed <> '';
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.replace_match_codes(uuid, text, uuid, uuid, text[], public.league_kind) from public;
grant execute on function public.replace_match_codes(uuid, text, uuid, uuid, text[], public.league_kind) to authenticated, service_role;

-- Captain-specific stats views avoid changing the public stats view contracts.
create or replace view public.captain_stats_game_log as
select
  league, match_id, max(game_date) as game_date, max(season) as season,
  max(season_phase) as season_phase, max(game_duration_min) as duration_min,
  max(team_name) filter (where team_side = 'Blue') as blue_team,
  max(team_name) filter (where team_side = 'Red') as red_team,
  case when bool_or(win) filter (where team_side = 'Blue')
    then max(team_name) filter (where team_side = 'Blue')
    else max(team_name) filter (where team_side = 'Red') end as winner_team,
  sum(kills) as total_kills
from public.raw_stats
group by league, match_id;
grant select on public.captain_stats_game_log to anon, authenticated;

create or replace view public.captain_stats_player_agg as
select league, summoner_name, tag, season, season_phase,
  mode() within group (order by role) as role_mode,
  count(*) as games, count(*) filter (where win) as wins,
  round(100.0 * count(*) filter (where win) / count(*), 1) as winrate_pct,
  round((sum(kills) + sum(assists))::numeric / greatest(sum(deaths), 1), 2) as kda
from public.raw_stats
group by league, summoner_name, tag, season, season_phase;
grant select on public.captain_stats_player_agg to anon, authenticated;
