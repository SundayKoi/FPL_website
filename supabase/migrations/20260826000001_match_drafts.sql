do $$ begin
  create type public.match_draft_status as enum ('drafting','complete');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.match_draft_layout as enum ('stage','board');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.match_drafts (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  game_number int not null check (game_number between 1 and 5),
  status public.match_draft_status not null default 'drafting',
  layout public.match_draft_layout not null default 'stage',
  current_step_index int not null default 0 check (current_step_index between 0 and 19),
  turn_started_at timestamptz,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, game_number),
  check (jsonb_typeof(actions) = 'array')
);

create index if not exists match_drafts_fixture_idx
  on public.match_drafts (fixture_id, game_number);

create or replace function public.touch_match_draft_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists touch_match_drafts_updated_at on public.match_drafts;
create trigger touch_match_drafts_updated_at
  before update on public.match_drafts
  for each row execute function public.touch_match_draft_updated_at();

create or replace function public.is_match_draft_captain(p_fixture_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.fixtures f
    join public.league_teams lt
      on lower(trim(lt.name)) in (lower(trim(f.team_a)), lower(trim(f.team_b)))
    join public.league_team_captains ltc
      on ltc.league_team_id = lt.id
     and ltc.season = f.season
    where f.id = p_fixture_id
      and ltc.profile_id = auth.uid()
  )
$$;

alter table public.match_drafts enable row level security;

drop policy if exists match_drafts_public_read on public.match_drafts;
create policy match_drafts_public_read on public.match_drafts
  for select using (true);

drop policy if exists match_drafts_captain_insert on public.match_drafts;
create policy match_drafts_captain_insert on public.match_drafts
  for insert to authenticated
  with check (public.is_admin() or public.is_match_draft_captain(fixture_id));

drop policy if exists match_drafts_captain_update on public.match_drafts;
create policy match_drafts_captain_update on public.match_drafts
  for update to authenticated
  using (public.is_admin() or public.is_match_draft_captain(fixture_id))
  with check (public.is_admin() or public.is_match_draft_captain(fixture_id));

drop policy if exists match_drafts_captain_delete on public.match_drafts;
create policy match_drafts_captain_delete on public.match_drafts
  for delete to authenticated
  using (public.is_admin() or public.is_match_draft_captain(fixture_id));

grant select on public.match_drafts to anon, authenticated;
grant insert, update, delete on public.match_drafts to authenticated;
grant all on public.match_drafts to service_role;

do $$ begin
  alter publication supabase_realtime add table public.match_drafts;
exception
  when duplicate_object then null;
end $$;
