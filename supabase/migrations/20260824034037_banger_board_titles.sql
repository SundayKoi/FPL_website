create table public.banger_board_settings (
  id boolean primary key default true check (id),
  hero_title text not null default 'Is it a banger?' check (char_length(hero_title) between 1 and 80),
  daily_title text not null default 'Banger check' check (char_length(daily_title) between 1 and 80),
  podium_title text not null default 'Top 3 all-time' check (char_length(podium_title) between 1 and 80),
  stinker_title text not null default 'Top stinkers' check (char_length(stinker_title) between 1 and 80),
  recent_title text not null default 'Last 45 days' check (char_length(recent_title) between 1 and 80),
  random_title text not null default 'Random pull' check (char_length(random_title) between 1 and 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.banger_board_settings enable row level security;
grant select on public.banger_board_settings to anon, authenticated;
grant insert, update on public.banger_board_settings to authenticated;

create policy "Anyone can read Banger Board titles"
  on public.banger_board_settings for select to anon, authenticated using (true);
create policy "Admins can create Banger Board titles"
  on public.banger_board_settings for insert to authenticated
  with check (public.is_admin() or public.is_owner());
create policy "Admins can edit Banger Board titles"
  on public.banger_board_settings for update to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

insert into public.banger_board_settings (id)
values (true)
on conflict (id) do nothing;
