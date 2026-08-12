-- ---------------------------------------------------------------------------
-- Match-reporting Task 4 (retargeted): captain-page tables. The public
-- /matches page from the original design is NOT built -- everything moves
-- onto a private /captain page. See docs/superpowers/specs/2026-08-11-
-- captains-page-design.md ("New tables" + "Access model") and
-- .superpowers/sdd/2026-08-11-match-reporting-auto-ingest/task-4-brief.md.
--
-- match_codes is the only genuinely private table in this app: no anon grant
-- at all, and its select policy admits only admins and the two captains of
-- that code's fixture. Storing team_a_id/team_b_id as league_teams FKs
-- directly (rather than resolving fixtures.team_a/team_b free text at read
-- time) is what makes that RLS rule exact -- see the design doc.
-- ---------------------------------------------------------------------------

-- === league_team_captains =====================================================
-- Who captains which league_team, per season. Seeded from the featured
-- draft's teams.captain_profile_id by sync_league_team_captains() below, so
-- admins don't retype what the draft already knows. Public select: who
-- captains a team is not secret (mirrors public.teams.captain_profile_id,
-- itself publicly readable).
create table public.league_team_captains (
  id uuid primary key default gen_random_uuid(),
  league_team_id uuid not null references public.league_teams(id) on delete cascade,
  season text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  unique (league_team_id, season, profile_id)
);

alter table public.league_team_captains enable row level security;
create policy league_team_captains_public_read on public.league_team_captains for select using (true);
create policy league_team_captains_admin_write on public.league_team_captains for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.league_team_captains to anon, authenticated;
grant insert, update, delete on public.league_team_captains to authenticated;
grant all on public.league_team_captains to service_role;

-- === sync_league_team_captains ================================================
-- For the featured draft (league_settings.featured_draft_id), match each
-- public.teams row with a captain to a league_teams row by name
-- (case-insensitive, trimmed) and insert the corresponding
-- league_team_captains row; on conflict do nothing. Re-runnable: safe to call
-- again as the draft's captains change. Returns the number of rows actually
-- inserted (GET DIAGNOSTICS ROW_COUNT after INSERT ... ON CONFLICT DO NOTHING
-- excludes skipped/conflicting rows, so a second call against unchanged data
-- returns 0).
--
-- This is an admin action (an admin triggers a re-sync so they don't have to
-- retype captains the draft already knows), so it follows this codebase's
-- established convention for admin-mutating SECURITY DEFINER RPCs
-- (admin_assign_player, admin_set_setup_team_budget, etc. -- see
-- 20260807000005_start_draft_pause.sql's _require_admin() and
-- 20260810000004_admin_assignment_integrity.sql's revoke/grant pattern):
-- perform _require_admin() as the first statement, then revoke the default
-- PUBLIC execute grant and re-grant only to authenticated/service_role. The
-- brief's Interfaces block doesn't spell this out explicitly, but leaving a
-- writing SECURITY DEFINER function open to any anon caller by default would
-- be the only such exception in the entire migration set.
create function public.sync_league_team_captains(p_season text) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  perform public._require_admin();

  insert into public.league_team_captains (league_team_id, season, profile_id)
  select lt.id, p_season, t.captain_profile_id
  from public.teams t
  join public.league_teams lt
    on lower(trim(lt.name)) = lower(trim(t.name))
  where t.draft_id = (select featured_draft_id from public.league_settings where id = 1)
    and t.captain_profile_id is not null
  on conflict (league_team_id, season, profile_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.sync_league_team_captains(text) from public;
grant execute on function public.sync_league_team_captains(text) to authenticated, service_role;

-- === is_captain_of ============================================================
-- Mirrors is_admin()'s style exactly (stable, security definer, pinned
-- search_path) -- see 20260807000001_schema.sql. Used both by match_codes'
-- select policy below and directly by app code. Deliberately left on the
-- default PUBLIC execute grant, like is_admin()/is_captain(): it is a pure,
-- side-effect-free read of the caller's own captaincy and must be callable
-- from within an RLS policy by any authenticated captain.
create function public.is_captain_of(p_league_team_id uuid, p_season text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_team_captains
    where league_team_id = p_league_team_id and season = p_season and profile_id = auth.uid()
  )
$$;

-- === match_codes ===============================================================
-- The one genuinely private table in the app. Tourney codes for a fixture
-- are visible only to admins and that fixture's two captains.
create table public.match_codes (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references public.fixtures(id) on delete set null,
  season text not null,
  team_a_id uuid not null references public.league_teams(id),
  team_b_id uuid not null references public.league_teams(id),
  game_number int not null,
  code text not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

create unique index match_codes_fixture_game_key
  on public.match_codes (fixture_id, game_number) where fixture_id is not null;

alter table public.match_codes enable row level security;

create policy match_codes_select on public.match_codes for select
  using (public.is_admin() or public.is_captain_of(team_a_id, season) or public.is_captain_of(team_b_id, season));
create policy match_codes_admin_write on public.match_codes for all
  using (public.is_admin()) with check (public.is_admin());

-- No anon grant at all (defence in depth beneath RLS) -- see brief.
grant select on public.match_codes to authenticated;
grant insert, update, delete on public.match_codes to authenticated;
grant all on public.match_codes to service_role;

-- === announcements =============================================================
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy announcements_select on public.announcements for select to authenticated
  using (public.is_admin() or exists (select 1 from public.league_team_captains where profile_id = auth.uid()));
create policy announcements_admin_write on public.announcements for all
  using (public.is_admin()) with check (public.is_admin());

-- No anon grant at all (defence in depth beneath RLS) -- see brief.
grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant all on public.announcements to service_role;
