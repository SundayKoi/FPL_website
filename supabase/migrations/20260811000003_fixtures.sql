-- Schedule fixtures for the split (Task: schedule page).
--
-- Stages mirror the Split 5 rulebook's league flow: 5 regular-season weeks
-- of intra-division Bo3s (Mondays 8pm ET), then the gauntlet's two Bo1
-- rounds (same day), then Quarterfinals (4 Bo5s, one day) -> Semifinals ->
-- Finals. Team names are plain text rather than FKs into public.teams:
-- teams there are per-draft auction rosters keyed by draft_id, while the
-- schedule outlives any single draft and must allow "TBD" (null) slots
-- before matchups are announced — same reasoning as raw_stats.team_name.
create type public.fixture_stage as enum (
  'week_1', 'week_2', 'week_3', 'week_4', 'week_5',
  'gauntlet_r1', 'gauntlet_r2',
  'quarterfinals', 'semifinals', 'finals'
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  stage public.fixture_stage not null,
  -- Regular-season matches are intra-division; gauntlet/playoffs matchups
  -- cross divisions, so division is nullable there.
  division text check (division in ('Solari', 'Lunari')),
  team_a text,
  team_b text,
  scheduled_at timestamptz,
  best_of int not null check (best_of in (1, 3, 5)),
  score_a int check (score_a >= 0),
  score_b int check (score_b >= 0),
  -- Scores land together or not at all — a half-reported result renders as
  -- a nonsense "2–null" card.
  check ((score_a is null) = (score_b is null)),
  sort_order int not null default 0,
  -- Season lives here (not only in 20260811000002_fixtures_season.sql) so a
  -- fresh reset produces the same table as an incrementally-migrated one:
  -- that migration's version sorts earlier, so it no-ops on a clean database.
  season text not null default 'S5',
  created_at timestamptz not null default now()
);

create index if not exists fixtures_season_stage_idx
  on public.fixtures (season, stage, sort_order);

alter table public.fixtures enable row level security;

create policy fixtures_public_read on public.fixtures for select using (true);
create policy fixtures_admin_write on public.fixtures for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.fixtures to anon, authenticated;
grant insert, update, delete on public.fixtures to authenticated;

-- service_role bypasses RLS (postdates 20260807000007_grants.sql's blanket
-- grant, same note as raw_stats).
grant all on public.fixtures to service_role;
