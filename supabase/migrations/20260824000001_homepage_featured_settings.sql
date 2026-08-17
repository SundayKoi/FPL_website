create table public.homepage_featured_settings (
  homepage text primary key check (homepage in ('premier', 'academy')),
  fixture_id uuid references public.fixtures(id) on delete set null,
  title text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.homepage_featured_settings enable row level security;

create policy homepage_featured_settings_public_read
  on public.homepage_featured_settings for select using (true);

create policy homepage_featured_settings_owner_or_admin_write
  on public.homepage_featured_settings for all
  using (public.is_owner() or public.is_admin())
  with check (public.is_owner() or public.is_admin());

grant select on public.homepage_featured_settings to anon, authenticated;
grant insert, update, delete on public.homepage_featured_settings to authenticated;
grant all on public.homepage_featured_settings to service_role;
