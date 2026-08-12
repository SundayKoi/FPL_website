create table public.free_agency_avg_bids (
  player_name text primary key,
  avg_bid int not null check (avg_bid >= 0),
  updated_at timestamptz not null default now()
);

alter table public.free_agency_avg_bids enable row level security;

create policy free_agency_avg_bids_public_read
  on public.free_agency_avg_bids for select using (true);

create policy free_agency_avg_bids_admin_write
  on public.free_agency_avg_bids for all
  using (public.is_admin())
  with check (public.is_admin());
