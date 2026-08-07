-- === Enums ===
create type public.lol_role as enum ('top','jungle','mid','adc','support');
create type public.draft_status as enum ('setup','live','paused','complete');
create type public.acquisition_type as enum ('captain','free_agency','auction');
create type public.lot_status as enum ('open','sold','cancelled');

-- === Tables ===
-- No FK to auth.users on purpose: keeps pgTAP fixtures simple. In production
-- rows are only created by the auth trigger below.
create table public.profiles (
  id uuid primary key,
  discord_id text unique,
  display_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.draft_status not null default 'setup',
  countdown_seconds int not null default 15 check (countdown_seconds between 5 and 300),
  round_minimums int[] not null default '{10,5,1}',
  current_round int not null default 1,
  current_nominator_team_id uuid,           -- FK added after teams exists
  paused_time_remaining interval,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  name text not null,
  captain_profile_id uuid references public.profiles(id),
  nomination_position int not null,
  budget_start int not null default 0 check (budget_start >= 0),
  points_remaining int not null default 0 check (points_remaining >= 0),
  unique (draft_id, nomination_position),
  unique (draft_id, captain_profile_id)
);

alter table public.drafts
  add constraint drafts_current_nominator_fk
  foreign key (current_nominator_team_id) references public.teams(id);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  display_name text not null,
  role public.lol_role not null,
  rank text,
  opgg_url text,
  notes text,
  team_id uuid references public.teams(id),
  price int check (price >= 0),
  acquisition public.acquisition_type,
  check ((team_id is null) = (acquisition is null))
);
-- a team can hold at most one player per role (role-locked roster)
create unique index players_one_per_role on public.players(team_id, role)
  where team_id is not null;

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  player_id uuid not null references public.players(id),
  nominated_by_team_id uuid not null references public.teams(id),
  round int not null,
  opening_bid int not null,
  current_bid int not null,
  leading_team_id uuid not null references public.teams(id),
  closes_at timestamptz not null,
  status public.lot_status not null default 'open',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
-- only one live auction per draft
create unique index lots_one_open_per_draft on public.lots(draft_id) where status = 'open';

create table public.bids (
  id bigint generated always as identity primary key,
  lot_id uuid not null references public.lots(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- === Helpers ===
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create function public.open_roles(p_team_id uuid) returns public.lol_role[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(r), '{}')
  from unnest(enum_range(null::public.lol_role)) as r
  where not exists (
    select 1 from public.players p where p.team_id = p_team_id and p.role = r
  )
$$;

create function public.caller_team(p_draft_id uuid) returns public.teams
language plpgsql stable security definer set search_path = public as $$
declare v_team public.teams;
begin
  select t.* into v_team from public.teams t
  where t.draft_id = p_draft_id and t.captain_profile_id = auth.uid();
  if not found then
    raise exception 'NOT_CAPTAIN: you are not a captain in this draft';
  end if;
  return v_team;
end $$;

create function public.get_server_time() returns timestamptz
language sql stable as $$ select now() $$;

-- === Auth trigger: create a profile for every new user (any provider) ===
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, discord_id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(coalesce(new.email,'player'), '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- === RLS ===
alter table public.profiles enable row level security;
alter table public.drafts   enable row level security;
alter table public.teams    enable row level security;
alter table public.players  enable row level security;
alter table public.lots     enable row level security;
alter table public.bids     enable row level security;

create policy profiles_public_read on public.profiles for select using (true);
create policy drafts_public_read   on public.drafts   for select using (true);
create policy teams_public_read    on public.teams    for select using (true);
create policy players_public_read  on public.players  for select using (true);
create policy lots_public_read     on public.lots     for select using (true);
create policy bids_public_read     on public.bids     for select using (true);

-- Admin setup CRUD happens as direct table writes (Task 15). Everything else
-- goes through SECURITY DEFINER RPCs, which bypass RLS.
create policy drafts_admin_write  on public.drafts  for all using (public.is_admin()) with check (public.is_admin());
create policy teams_admin_write   on public.teams   for all using (public.is_admin()) with check (public.is_admin());
create policy players_admin_write on public.players for all using (public.is_admin()) with check (public.is_admin());

-- === Realtime ===
alter publication supabase_realtime add table
  public.profiles, public.drafts, public.teams, public.players, public.lots, public.bids;
