-- Hidden-coin contest: a coin is hidden in the Info page rulebook; the
-- first finders to click it while signed in win prizes. One find per
-- account, ordered by find time so staff can rank winners.
create table public.coin_finds (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  found_at timestamptz not null default now()
);

alter table public.coin_finds enable row level security;

create policy coin_finds_admin_select on public.coin_finds
  for select using (public.is_admin());
create policy coin_finds_admin_delete on public.coin_finds
  for delete using (public.is_admin());

grant select, delete on public.coin_finds to authenticated;
grant all on public.coin_finds to service_role;

create function public.claim_coin() returns int
language plpgsql security definer set search_path = public as $$
declare v_rank int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in to claim the coin';
  end if;
  insert into public.coin_finds (profile_id) values (auth.uid())
  on conflict (profile_id) do nothing;
  select count(*) into v_rank
  from public.coin_finds f
  where f.found_at <= (select found_at from public.coin_finds where profile_id = auth.uid());
  return v_rank;
end $$;

revoke execute on function public.claim_coin() from public, anon;
grant execute on function public.claim_coin() to authenticated;
