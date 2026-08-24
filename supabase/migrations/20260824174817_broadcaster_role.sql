alter table public.profiles
  add column if not exists is_broadcaster boolean not null default false;

create or replace function public.is_broadcaster()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_broadcaster from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_broadcaster() from public;
grant execute on function public.is_broadcaster() to anon, authenticated, service_role;

drop policy if exists homepage_featured_settings_owner_or_admin_write
  on public.homepage_featured_settings;

create policy homepage_featured_settings_owner_or_admin_write
  on public.homepage_featured_settings
  for all
  using (public.is_owner() or public.is_admin() or public.is_broadcaster())
  with check (public.is_owner() or public.is_admin() or public.is_broadcaster());

create or replace function public.set_profile_broadcaster(
  p_profile_id uuid,
  p_is_broadcaster boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: only a league owner can change broadcaster access';
  end if;

  if p_is_broadcaster is null then
    raise exception 'BROADCASTER_INVALID: pass true or false';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'PROFILE_INVALID: profile not found';
  end if;

  update public.profiles
  set is_broadcaster = p_is_broadcaster
  where id = p_profile_id;
end;
$$;

revoke all on function public.set_profile_broadcaster(uuid, boolean) from public;
grant execute on function public.set_profile_broadcaster(uuid, boolean) to authenticated, service_role;
