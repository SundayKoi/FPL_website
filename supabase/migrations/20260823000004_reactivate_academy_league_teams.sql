-- Academy teams reusing a retired Premier name were left deactivated.
--
-- league_teams.name is unique and accumulates every name the league has ever
-- used, with retired ones flagged active = false. _sync_academy_teams_from_draft
-- only INSERTs names that do not already exist, so an Academy team whose name
-- Premier used in an earlier season (Astronauts, Divine Ascension) matched an
-- existing retired row and was skipped: never reactivated, and still carrying
-- Premier's old abbreviation.
--
-- The visible damage is on /captain. fetchCaptainContext builds its team
-- pickers from activeTeams (active <> false), so those teams were missing from
-- the report form and their captains could not submit a result at all.

-- === repair the current rows ================================================
update public.league_teams
set active = true
where lower(trim(name)) in (select public.academy_team_names())
  and active = false;

-- Realign abbreviations to the draft's own, where that does not collide with
-- another team. league_teams.abbreviation is unique, so a taken one is left
-- alone rather than failing the migration over a display string.
do $$
declare r record;
begin
  for r in
    select lt.id, lt.name, lt.abbreviation as have, upper(trim(t.abbreviation)) as want
    from public.teams t
    join public.league_settings s on s.id = 1
    join public.league_teams lt on lower(trim(lt.name)) = lower(trim(t.name))
    where s.academy_draft_id is not null
      and t.draft_id = s.academy_draft_id
      and coalesce(trim(t.abbreviation), '') <> ''
      and lower(trim(lt.abbreviation)) is distinct from lower(trim(t.abbreviation))
  loop
    if exists (select 1 from public.league_teams x
               where lower(x.abbreviation) = lower(r.want) and x.id <> r.id) then
      raise notice 'Kept abbreviation % for %: % is already taken.', r.have, r.name, r.want;
    else
      update public.league_teams set abbreviation = r.want where id = r.id;
    end if;
  end loop;
end $$;

-- === stop it recurring ======================================================
-- Same body as 20260821000001, plus a reactivation pass first: a name that
-- already exists is now un-retired rather than silently skipped.
create or replace function public._sync_academy_teams_from_draft() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
  v_inserted int := 0;
begin
  -- An Academy team reusing a retired Premier name needs the existing row
  -- brought back into service; the insert below would skip it.
  update public.league_teams
  set active = true
  where lower(trim(name)) in (select public.academy_team_names())
    and active = false;

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
