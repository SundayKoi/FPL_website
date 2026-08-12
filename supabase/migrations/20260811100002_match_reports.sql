-- ---------------------------------------------------------------------------
-- Match-reporting Task 2: match report queue tables. Captains report
-- finished series on the website; these tables are the queue a scheduled
-- ingest job (Task 7) later drains into public.raw_stats. See
-- docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md
-- ("Data model" section) and .superpowers/sdd/2026-08-11-match-reporting-
-- auto-ingest/task-2-brief.md.
--
-- MERGE AMENDMENT (2026-08-11): match_reports carries an optional, nullable,
-- NOT-unique fixture_id -> public.fixtures(id) on delete set null. Reports
-- are deliberately standalone rather than children of `fixtures`: a series
-- is one fixtures row but N Riot games with their own per-game ingest
-- status, fixtures is admin-write-only (captains must never gain write
-- access to the public schedule table), scrims/makeup games have no fixture
-- at all, and fixtures.team_a/team_b is uncontrolled free text rather than a
-- league_teams FK. The link exists only to let a later task (score auto-fill)
-- know which fixture, if any, a finished report corresponds to. Full
-- rationale: .superpowers/sdd/2026-08-11-match-reporting-auto-ingest/
-- overlap-analysis.md section 3.
-- ---------------------------------------------------------------------------

-- === is_captain() ============================================================
-- Mirrors is_admin()'s style exactly (stable, security definer, pinned
-- search_path) -- see 20260807000001_schema.sql. Deliberately not scoped to
-- any particular draft/season: captain of any draft, ever, satisfies it (see
-- overlap-analysis.md's noted follow-up if tighter scoping is wanted later).
create function public.is_captain() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teams where captain_profile_id = auth.uid())
$$;

-- === match_reports ===========================================================
create table public.match_reports (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  season_phase text not null,
  team_a_id uuid not null references public.league_teams(id),
  team_b_id uuid not null references public.league_teams(id),
  score_a int not null default 0 check (score_a >= 0),
  score_b int not null default 0 check (score_b >= 0),
  draft_url text,
  submitted_by uuid references public.profiles(id),
  submitted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'ingested', 'needs_sides', 'failed')),
  error_text text,
  warning_text text,
  ingested_at timestamptz,
  fixture_id uuid references public.fixtures(id) on delete set null,
  check (team_a_id <> team_b_id)
);

-- Optional link lookups ("the report(s) for fixture X"). Partial: most
-- reports have no fixture_id, so indexing only the non-null rows keeps this
-- small. Deliberately not unique -- a disputed series may be re-reported.
create index match_reports_fixture_id_idx
  on public.match_reports (fixture_id) where fixture_id is not null;

alter table public.match_reports enable row level security;

create policy match_reports_public_read on public.match_reports for select using (true);
create policy match_reports_insert on public.match_reports for insert to authenticated
  with check (public.is_admin() or public.is_captain());
create policy match_reports_admin_update on public.match_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy match_reports_delete on public.match_reports for delete to authenticated
  using (public.is_admin() or (submitted_by = auth.uid() and status = 'pending'));

grant select on public.match_reports to anon, authenticated;
grant insert, update, delete on public.match_reports to authenticated;
grant all on public.match_reports to service_role;

-- === match_report_games ======================================================
create table public.match_report_games (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.match_reports(id) on delete cascade,
  game_number int not null,
  match_id text not null unique,
  blue_team_id uuid references public.league_teams(id),
  resolved_blue_team_id uuid references public.league_teams(id),
  status text not null default 'pending' check (status in ('pending', 'ingested', 'needs_side', 'failed')),
  error_text text,
  unique (report_id, game_number)
);

alter table public.match_report_games enable row level security;

create policy match_report_games_public_read on public.match_report_games for select using (true);
create policy match_report_games_insert on public.match_report_games for insert to authenticated
  with check (public.is_admin() or public.is_captain());
create policy match_report_games_update on public.match_report_games for update to authenticated
  using ((public.is_admin() or public.is_captain())
         and exists (select 1 from public.match_reports r
                      where r.id = report_id and r.status <> 'ingested'))
  with check (public.is_admin() or public.is_captain());
create policy match_report_games_delete on public.match_report_games for delete to authenticated
  using (public.is_admin());

grant select on public.match_report_games to anon, authenticated;
grant insert, update, delete on public.match_report_games to authenticated;
grant all on public.match_report_games to service_role;
