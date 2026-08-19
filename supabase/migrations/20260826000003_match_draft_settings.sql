-- Per-fixture drafter format: captains/admins pick Bo1/Bo3/Bo5 and whether
-- the series is fearless (previous games' picks blocked). One row per
-- fixture; absence falls back to the code default (regular season Bo3
-- fearless — see src/lib/match-draft/rules.ts's matchDraftBestOf).
create table if not exists public.match_draft_settings (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  best_of int not null default 3 check (best_of in (1, 3, 5)),
  fearless boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Same row-touch behavior as match_drafts (function defined in
-- 20260826000001_match_drafts.sql).
drop trigger if exists touch_match_draft_settings_updated_at on public.match_draft_settings;
create trigger touch_match_draft_settings_updated_at
  before update on public.match_draft_settings
  for each row execute function public.touch_match_draft_updated_at();

alter table public.match_draft_settings enable row level security;

-- Mirrors match_drafts' policies: anyone can read, the fixture's captains
-- and admins can write (is_match_draft_captain defined alongside
-- match_drafts).
drop policy if exists match_draft_settings_public_read on public.match_draft_settings;
create policy match_draft_settings_public_read on public.match_draft_settings
  for select using (true);

drop policy if exists match_draft_settings_captain_insert on public.match_draft_settings;
create policy match_draft_settings_captain_insert on public.match_draft_settings
  for insert to authenticated
  with check (public.is_admin() or public.is_match_draft_captain(fixture_id));

drop policy if exists match_draft_settings_captain_update on public.match_draft_settings;
create policy match_draft_settings_captain_update on public.match_draft_settings
  for update to authenticated
  using (public.is_admin() or public.is_match_draft_captain(fixture_id))
  with check (public.is_admin() or public.is_match_draft_captain(fixture_id));

drop policy if exists match_draft_settings_captain_delete on public.match_draft_settings;
create policy match_draft_settings_captain_delete on public.match_draft_settings
  for delete to authenticated
  using (public.is_admin() or public.is_match_draft_captain(fixture_id));

grant select on public.match_draft_settings to anon, authenticated;
grant insert, update, delete on public.match_draft_settings to authenticated;
grant all on public.match_draft_settings to service_role;
