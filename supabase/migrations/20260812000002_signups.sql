-- Player signups: replaces the Google Form for joining a split's player
-- pool. Open-form by design (no account required — the form is the same
-- barrier-free flow as the sheet), so anon can INSERT but only admins can
-- read or manage rows. Length checks keep drive-by junk bounded.
--
-- season is stamped by the signup page from league_settings.current_season
-- at submit time, so each split's pool stays separate without anyone
-- editing the form between splits.
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  season text not null check (char_length(season) between 1 and 16),
  discord text not null check (char_length(discord) between 2 and 64),
  riot_id text not null check (char_length(riot_id) between 3 and 64),
  -- op.gg link(s) — the form asks for ALL level-30+ accounts, possibly one
  -- URL per line, hence the generous cap.
  opgg text not null check (char_length(opgg) between 10 and 2000),
  current_rank text not null check (char_length(current_rank) between 2 and 32),
  -- "Peak rank in the last two seasons" — deliberately season-agnostic
  -- wording so the question never needs editing between splits.
  peak_rank text not null check (char_length(peak_rank) between 2 and 32),
  primary_role public.lol_role not null,
  secondary_role public.lol_role check (secondary_role is distinct from primary_role),
  captain_interest boolean not null default false,
  player_status text not null check (player_status in ('new', 'returning')),
  created_at timestamptz not null default now()
);

create index signups_season_idx on public.signups (season, created_at desc);

alter table public.signups enable row level security;

-- Anyone may submit; only admins may see or manage what was submitted
-- (signups carry Discord handles — staff-facing data, like the old sheet).
create policy signups_public_insert on public.signups
  for insert with check (true);
create policy signups_admin_select on public.signups
  for select using (public.is_admin());
create policy signups_admin_update on public.signups
  for update using (public.is_admin()) with check (public.is_admin());
create policy signups_admin_delete on public.signups
  for delete using (public.is_admin());

grant insert on public.signups to anon, authenticated;
grant select, update, delete on public.signups to authenticated;
grant all on public.signups to service_role;
