-- Add Academy teams to the existing captain workflow. Academy is intentionally
-- not a second captain schema: fixtures, codes, reports, rosters, and stats
-- already work for any row in league_teams.

create or replace function public._sync_academy_teams_from_draft() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
  v_inserted int := 0;
begin
  for r in
    select t.name, t.abbreviation
    from public.teams t
    where t.draft_id = (select academy_draft_id from public.league_settings where id = 1)
      and not exists (
        select 1 from public.league_teams lt
        where lower(trim(lt.name)) = lower(trim(t.name))
      )
    order by t.name
  loop
    v_base := upper(left(regexp_replace(coalesce(nullif(trim(r.abbreviation), ''), trim(r.name)), '[^A-Za-z0-9]', '', 'g'), 5));
    if v_base = '' then v_base := 'TEAM'; end if;
    v_candidate := v_base;
    v_suffix := 1;
    while exists (select 1 from public.league_teams where lower(abbreviation) = lower(v_candidate)) loop
      v_suffix := v_suffix + 1;
      v_candidate := left(v_base, greatest(5 - length(v_suffix::text), 1)) || v_suffix::text;
    end loop;
    insert into public.league_teams (name, abbreviation)
    values (trim(r.name), v_candidate)
    on conflict (name) do nothing;
    if found then v_inserted := v_inserted + 1; end if;
  end loop;
  return v_inserted;
end;
$$;
revoke all on function public._sync_academy_teams_from_draft() from public;
grant execute on function public._sync_academy_teams_from_draft() to service_role;

-- Seed Academy teams/captains during migration for existing deployments.
select public._sync_academy_teams_from_draft();
insert into public.league_team_captains (league_team_id, season, profile_id)
select lt.id, settings.current_season, t.captain_profile_id
from public.teams t
join public.league_settings settings on settings.id = 1
join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
where t.draft_id = settings.academy_draft_id
  and t.captain_profile_id is not null
on conflict (league_team_id, season, profile_id) do nothing;

create or replace function public.sync_academy_teams_from_draft() returns int
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._sync_academy_teams_from_draft();
end;
$$;
revoke all on function public.sync_academy_teams_from_draft() from public;
grant execute on function public.sync_academy_teams_from_draft() to authenticated, service_role;

create or replace function public.sync_academy_team_captains(p_season text) returns int
language plpgsql security definer set search_path = public as $$
declare v_inserted int;
begin
  perform public._require_admin();
  insert into public.league_team_captains (league_team_id, season, profile_id)
  select lt.id, p_season, t.captain_profile_id
  from public.teams t
  join public.league_settings settings on settings.id = 1
  join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
  where t.draft_id = settings.academy_draft_id
    and t.captain_profile_id is not null
  on conflict (league_team_id, season, profile_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.sync_academy_team_captains(text) from public;
grant execute on function public.sync_academy_team_captains(text) to authenticated, service_role;
