-- Same reuse bug as 20260823000004, for Premier.
--
-- sync_league_teams_from_draft only INSERTs names absent from league_teams, so
-- a featured-draft team whose name the league used in an earlier season and
-- then retired (active = false) is skipped: never brought back into service.
-- Its captains then cannot pick their own team in the report form, which reads
-- from activeTeams.
--
-- Not hypothetical: names recur between splits (Wildcats have appeared in
-- consecutive seasons), so this fires whenever a retired name is drafted again.

create or replace function public.featured_team_names() returns setof text
language sql stable set search_path = public as $$
  select lower(trim(t.name))
  from public.teams t
  join public.league_settings s on s.id = 1
  where s.featured_draft_id is not null
    and t.draft_id = s.featured_draft_id;
$$;

revoke all on function public.featured_team_names() from public;
grant execute on function public.featured_team_names() to authenticated, service_role;

-- Repair any currently-retired featured-draft team.
update public.league_teams
set active = true
where lower(trim(name)) in (select public.featured_team_names())
  and active = false;

-- Same body as 20260811100006, plus the reactivation pass.
create or replace function public.sync_league_teams_from_draft() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
  v_abbr text;
  v_inserted int := 0;
  v_row_count int;
begin
  perform public._require_admin();

  -- A drafted team reusing a retired name needs the existing row un-retired;
  -- the insert below skips it, leaving its captains locked out of reporting.
  update public.league_teams
  set active = true
  where lower(trim(name)) in (select public.featured_team_names())
    and active = false;

  for r in
    select t.name, t.abbreviation
    from public.teams t
    where t.draft_id = (select featured_draft_id from public.league_settings where id = 1)
      and not exists (
        select 1 from public.league_teams lt
        where lower(trim(lt.name)) = lower(trim(t.name))
      )
    order by t.name
  loop
    if exists (
      select 1 from public.league_teams
      where lower(trim(name)) = lower(trim(r.name))
    ) then
      continue;
    end if;

    if r.abbreviation is not null and trim(r.abbreviation) <> ''
       and not exists (
         select 1 from public.league_teams
         where lower(abbreviation) = lower(trim(r.abbreviation))
       )
    then
      v_abbr := trim(r.abbreviation);
    else
      v_base := upper(left(regexp_replace(
        coalesce((
          select string_agg(left(w, 1), '' order by ord)
          from unnest(regexp_split_to_array(trim(r.name), '\s+')) with ordinality as t(w, ord)
          where w <> ''
        ), ''),
        '[^A-Za-z0-9]', '', 'g'
      ), 5));

      if v_base is null or v_base = '' then
        v_base := 'TEAM';
      end if;

      v_candidate := v_base;
      v_suffix := 1;
      while exists (select 1 from public.league_teams where lower(abbreviation) = lower(v_candidate)) loop
        v_suffix := v_suffix + 1;
        v_candidate := left(v_base, greatest(5 - length(v_suffix::text), 1)) || v_suffix::text;
      end loop;
      v_abbr := v_candidate;
    end if;

    insert into public.league_teams (name, abbreviation)
    values (trim(r.name), v_abbr)
    on conflict (name) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.sync_league_teams_from_draft() from public;
grant execute on function public.sync_league_teams_from_draft() to authenticated, service_role;
