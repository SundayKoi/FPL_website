-- Betting integration: port the FPL Exchange gambling schema into this repo
-- under a `betting_` prefix, so it lives alongside the draft/league schema
-- without colliding on table names. Ported from c:\fpl_gambling\db\migrations
-- (001_schema.sql, 008_announcements.sql, 010_pickem_cashout.sql,
-- 011_seasons.sql, 014_opening_line.sql, 018_draws.sql) with renames:
--   users -> betting_profiles, ledger -> betting_ledger, teams -> betting_teams,
--   events -> betting_events, markets -> betting_markets, bets -> betting_bets,
--   store_items -> betting_store_items, purchases -> betting_purchases,
--   admin_audit -> betting_admin_audit, announcements -> betting_announcements,
--   pickems/pickem_* -> betting_pickems/betting_pickem_*,
--   seasons -> betting_seasons, season_results -> betting_season_results.
-- Schema only (tables, RLS, grants) — RPCs land in a later task.

-- === Tables ===

-- Replaces the source `users` table. profile_id links a betting wallet to
-- this repo's existing auth identity (public.profiles), when one exists.
create table public.betting_profiles (
  discord_id  text primary key,
  profile_id  uuid unique references public.profiles(id),
  username    text not null,
  avatar_url  text,
  role        text not null default 'member',
  balance     bigint not null default 0 check (balance >= 0),
  last_daily  timestamptz,
  created_at  timestamptz default now()
);

create table public.betting_teams (
  id          bigint generated always as identity primary key,
  name        text not null,
  short_code  text not null,
  color       text not null default '#888780',
  logo_url    text
);

create table public.betting_events (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text
);

-- team_a_id/team_b_id/winning_team_id keep the source FKs to betting_teams.
-- open_line_prob_a (014_opening_line.sql) and draw_enabled/drawn
-- (018_draws.sql) are ported in alongside the base 001_schema.sql columns.
create table public.betting_markets (
  id                bigint generated always as identity primary key,
  event_id          bigint not null references public.betting_events(id),
  team_a_id         bigint not null references public.betting_teams(id),
  team_b_id         bigint not null references public.betting_teams(id),
  title             text,
  rules             text,
  status            text not null default 'OPEN' check (status in ('OPEN','LOCKED','RESOLVED','CANCELLED')),
  open_at           timestamptz not null default now(),
  game_at           timestamptz not null,
  lock_at           timestamptz not null,
  winning_team_id   bigint references public.betting_teams(id),
  rake_bps          int not null default 0 check (rake_bps between 0 and 10000),
  riot_match_id     text,
  created_by        text references public.betting_profiles(discord_id),
  resolved_at       timestamptz,
  open_line_prob_a  numeric(4,3) check (open_line_prob_a is null or (open_line_prob_a > 0 and open_line_prob_a < 1)),
  draw_enabled      boolean not null default false,
  drawn             boolean not null default false,
  constraint betting_markets_distinct_teams check (team_a_id <> team_b_id)
);
create index on public.betting_markets (event_id, status);

-- team_id has no FK to betting_teams: -1 is the sentinel for "the Draw" (see
-- 018_draws.sql), which is never a real team id, so a hard FK would reject it.
create table public.betting_bets (
  id          bigint generated always as identity primary key,
  market_id   bigint not null references public.betting_markets(id),
  discord_id  text not null references public.betting_profiles(discord_id),
  team_id     bigint not null,
  amount      bigint not null check (amount > 0),
  payout      bigint,
  settled     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.betting_bets (market_id, team_id);
create index on public.betting_bets (discord_id);

create table public.betting_ledger (
  id          bigint generated always as identity primary key,
  discord_id  text not null references public.betting_profiles(discord_id),
  delta       bigint not null,
  reason      text not null,
  ref_table   text,
  ref_id      bigint,
  created_at  timestamptz not null default now()
);
create index on public.betting_ledger (discord_id, created_at desc);

create table public.betting_store_items (
  id          bigint generated always as identity primary key,
  name        text not null,
  description text,
  cost        bigint not null check (cost > 0),
  type        text not null,
  payload     jsonb not null default '{}',
  active      boolean not null default true
);

create table public.betting_purchases (
  id              bigint generated always as identity primary key,
  discord_id      text not null references public.betting_profiles(discord_id),
  item_id         bigint not null references public.betting_store_items(id),
  cost            bigint not null,
  fulfilled       boolean not null default false,
  fulfillment_ref text,
  created_at      timestamptz not null default now()
);

create table public.betting_admin_audit (
  id          bigint generated always as identity primary key,
  actor       text not null references public.betting_profiles(discord_id),
  action      text not null,
  target      text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index on public.betting_admin_audit (created_at desc);

create table public.betting_announcements (
  market_id  bigint not null references public.betting_markets(id) on delete cascade,
  kind       text not null check (kind in ('open', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  primary key (market_id, kind)
);

create table public.betting_pickems (
  id              bigint generated always as identity primary key,
  event_id        bigint not null references public.betting_events(id),
  title           text not null,
  status          text not null default 'OPEN',  -- OPEN | LOCKED | RESOLVED | CANCELLED
  carryover       bigint not null default 0,
  lock_at         timestamptz not null,
  resolved_at     timestamptz,
  created_by      text references public.betting_profiles(discord_id),
  announced_open  boolean not null default false,
  announced_done  boolean not null default false
);

create table public.betting_pickem_legs (
  pickem_id bigint not null references public.betting_pickems(id) on delete cascade,
  market_id bigint not null references public.betting_markets(id),
  primary key (pickem_id, market_id)
);

create table public.betting_pickem_cards (
  id          bigint generated always as identity primary key,
  pickem_id   bigint not null references public.betting_pickems(id),
  discord_id  text not null references public.betting_profiles(discord_id),
  amount      bigint not null check (amount > 0),
  picks       jsonb not null,
  correct     int,
  payout      bigint,
  settled     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (pickem_id, discord_id)
);

create table public.betting_pickem_bank (
  id      int primary key default 1 check (id = 1),
  balance bigint not null default 0
);
insert into public.betting_pickem_bank values (1, 0);

create table public.betting_seasons (
  id                bigint generated always as identity primary key,
  name              text not null,
  status            text not null default 'ACTIVE',  -- ACTIVE | CLOSED
  started_at        timestamptz not null default now(),
  closed_at         timestamptz,
  created_by        text references public.betting_profiles(discord_id),
  announced_closed  boolean not null default false
);

create table public.betting_season_results (
  season_id  bigint not null references public.betting_seasons(id),
  rank       int not null,
  discord_id text not null references public.betting_profiles(discord_id),
  username   text,
  balance    bigint not null,
  primary key (season_id, rank)
);

-- === RLS ===
alter table public.betting_profiles      enable row level security;
alter table public.betting_teams         enable row level security;
alter table public.betting_events        enable row level security;
alter table public.betting_markets       enable row level security;
alter table public.betting_bets          enable row level security;
alter table public.betting_ledger        enable row level security;
alter table public.betting_store_items   enable row level security;
alter table public.betting_purchases     enable row level security;
alter table public.betting_admin_audit   enable row level security;
alter table public.betting_announcements enable row level security;
alter table public.betting_pickems       enable row level security;
alter table public.betting_pickem_legs   enable row level security;
alter table public.betting_pickem_cards  enable row level security;
alter table public.betting_pickem_bank   enable row level security;
alter table public.betting_seasons       enable row level security;
alter table public.betting_season_results enable row level security;

-- Public read: everything a spectator/leaderboard view needs. Profiles read
-- exposes username/balance for the leaderboard — matches the old site.
create policy betting_public_read on public.betting_markets        for select using (true);
create policy betting_public_read on public.betting_teams          for select using (true);
create policy betting_public_read on public.betting_events         for select using (true);
create policy betting_public_read on public.betting_bets           for select using (true);
create policy betting_public_read on public.betting_pickems        for select using (true);
create policy betting_public_read on public.betting_pickem_legs    for select using (true);
create policy betting_public_read on public.betting_pickem_cards   for select using (true);
create policy betting_public_read on public.betting_pickem_bank    for select using (true);
create policy betting_public_read on public.betting_store_items    for select using (true);
create policy betting_public_read on public.betting_seasons        for select using (true);
create policy betting_public_read on public.betting_season_results for select using (true);
create policy betting_public_read on public.betting_profiles       for select using (true);

-- No read policy on betting_ledger, betting_admin_audit, betting_purchases,
-- betting_announcements — server/RPC (service_role) only.

-- === Grants ===
-- PostgREST requires explicit table grants (RLS remains the real gate).
grant select on public.betting_markets, public.betting_teams, public.betting_events,
  public.betting_bets, public.betting_profiles, public.betting_pickems,
  public.betting_pickem_legs, public.betting_pickem_cards, public.betting_pickem_bank,
  public.betting_store_items, public.betting_seasons, public.betting_season_results
  to anon, authenticated;
-- No insert/update/delete grants to anon/authenticated on any betting table.

-- service_role bypasses RLS and needs full access (bot RPCs, admin API)
grant all on all tables in schema public to service_role;

-- === Realtime ===
alter publication supabase_realtime add table public.betting_markets, public.betting_bets;
