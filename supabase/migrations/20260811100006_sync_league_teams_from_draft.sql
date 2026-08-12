-- ---------------------------------------------------------------------------
-- Production rollout fix: public.league_teams (20260811100001_league_config.sql)
-- is seeded only from historical public.raw_stats.team_name values via
-- sync_league_teams_from_stats(). In production that produced 34 names from
-- past seasons, but the CURRENT season's featured draft has teams whose names
-- mostly do NOT appear in raw_stats yet (no ingested games under those names).
-- sync_league_team_captains(season) matches draft teams.name against
-- league_teams.name, so most captains failed to link and the /captain gate
-- shut most of the league out. This migration adds a second seeding path --
-- from the featured draft's own public.teams rows -- run BEFORE
-- sync_league_team_captains so every draft team has a league_teams row to
-- match against, regardless of stats history.
--
-- Mirrors sync_league_teams_from_stats()'s admin-mutating SECURITY DEFINER
-- convention (perform _require_admin() first, then revoke/grant -- see
-- 20260811100003_captain_page.sql's sync_league_team_captains for the same
-- pattern applied to a writing RPC callable from the client, which is what
-- this one is too: an admin clicks a button on /captain, unlike
-- sync_league_teams_from_stats() which only load-stats.ts and this migration
-- itself call).
-- ---------------------------------------------------------------------------

-- === sync_league_teams_from_draft ============================================
-- For the featured draft (league_settings.featured_draft_id), insert a
-- league_teams row for each public.teams row whose trimmed name doesn't
-- already exist in league_teams (case-insensitive, trimmed comparison).
-- Abbreviation: prefer the draft team's own public.teams.abbreviation
-- (20260810000005_team_identity.sql) when it's non-blank and not already
-- taken (case-insensitive) -- draft captains already picked one, no need to
-- derive a fresh one. Otherwise fall back to the same initials-from-name
-- derivation and collision-suffix resolution sync_league_teams_from_stats()
-- uses, so both paths produce abbreviations in the same style and never
-- collide with each other's output.
--
-- Re-runnable like its sibling: only names absent from league_teams are
-- considered, and abbreviation collisions are checked against the *live*
-- table on every iteration (not a single set-based query), so an abbreviation
-- assigned earlier in the same call is immediately visible to later
-- iterations -- this also means two draft teams that happen to share an
-- abbreviation (public.teams.abbreviation has no uniqueness constraint,
-- unlike league_teams.abbreviation) resolve to distinct league_teams
-- abbreviations instead of the second insert failing outright. A per-
-- iteration case-insensitive re-check against league_teams.name (in addition
-- to the initial cursor filter) guards the same way against two draft teams
-- whose names collide only by case within a single call.
create function public.sync_league_teams_from_draft() returns int
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
    -- Skip a draft team whose name collided (case/whitespace-insensitively)
    -- with a row inserted earlier in this same call -- the initial cursor
    -- filter above only saw league_teams as it stood before the loop began.
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
