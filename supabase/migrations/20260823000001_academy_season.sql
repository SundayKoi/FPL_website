-- Academy gets its own season numbering.
--
-- Academy has been sharing league_settings.current_season with Premier, so its
-- games, fixtures, reports and rosters were all labelled S5. That put Premier's
-- S1-S4 history in the Academy stats season picker even though this is the
-- Academy's first split. Academy rows move to their own code (A1 by default)
-- so every season-scoped query separates the two leagues for free.
--
-- Identity rule, unchanged from the app: an Academy row is one whose team is a
-- team in the academy draft (league_settings.academy_draft_id), matched on
-- trimmed, case-insensitive name -- the same match sync_academy_teams_from_draft
-- and src/lib/league/context.ts already use.

alter table public.league_settings
  add column if not exists academy_season text;

update public.league_settings
set academy_season = 'A1'
where academy_season is null;

alter table public.league_settings
  alter column academy_season set default 'A1',
  alter column academy_season set not null;

-- === helpers =================================================================
-- The re-tagging below needs "which teams are Academy" five times over, once
-- as names (fixtures/raw_stats store free text) and once as league_teams ids
-- (reports/rosters/captains/codes store uuids). Both are read-only lookups
-- over data that is already publicly readable.

create or replace function public.academy_team_names() returns setof text
language sql stable set search_path = public as $$
  select lower(trim(t.name))
  from public.teams t
  join public.league_settings s on s.id = 1
  where s.academy_draft_id is not null
    and t.draft_id = s.academy_draft_id;
$$;

create or replace function public.academy_league_team_ids() returns setof uuid
language sql stable set search_path = public as $$
  select lt.id
  from public.league_teams lt
  where lower(trim(lt.name)) in (select public.academy_team_names());
$$;

revoke all on function public.academy_team_names() from public;
revoke all on function public.academy_league_team_ids() from public;
grant execute on function public.academy_team_names() to authenticated, service_role;
grant execute on function public.academy_league_team_ids() to authenticated, service_role;

-- === re-tag existing Academy rows ===========================================
-- Every update is scoped to season = current_season as well as to Academy
-- teams. Academy team names can collide with names Premier used in S1-S4
-- (league_teams accumulates every name the league has ever used), and those
-- historical rows must stay where they are.

-- Fixtures match on either side: an Academy fixture is one an Academy team
-- plays in, the same OR-test filterAcademyFixtures applies.
update public.fixtures f
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and f.season = s.current_season
  and (
    lower(trim(coalesce(f.team_a, ''))) in (select public.academy_team_names())
    or lower(trim(coalesce(f.team_b, ''))) in (select public.academy_team_names())
  );

update public.match_reports r
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and r.season = s.current_season
  and (
    r.team_a_id in (select public.academy_league_team_ids())
    or r.team_b_id in (select public.academy_league_team_ids())
  );

update public.match_codes c
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and c.season = s.current_season
  and (
    c.team_a_id in (select public.academy_league_team_ids())
    or c.team_b_id in (select public.academy_league_team_ids())
  );

update public.roster_memberships m
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and m.season = s.current_season
  and m.league_team_id in (select public.academy_league_team_ids());

update public.league_team_captains ltc
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and ltc.season = s.current_season
  and ltc.league_team_id in (select public.academy_league_team_ids())
  -- A captain may already have been synced under the Academy season; the
  -- (league_team_id, season, profile_id) unique index would reject the move.
  and not exists (
    select 1 from public.league_team_captains existing
    where existing.league_team_id = ltc.league_team_id
      and existing.profile_id = ltc.profile_id
      and existing.season = s.academy_season
  );

-- Any duplicate left behind by the guard above is now redundant.
delete from public.league_team_captains ltc
using public.league_settings s
where s.id = 1
  and ltc.season = s.current_season
  and ltc.league_team_id in (select public.academy_league_team_ids());

update public.raw_stats rs
set season = s.academy_season
from public.league_settings s
where s.id = 1
  and rs.season = s.current_season
  and lower(trim(coalesce(rs.team_name, ''))) in (select public.academy_team_names());
