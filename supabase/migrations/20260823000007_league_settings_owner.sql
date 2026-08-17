-- league_settings holds the league's shape: season codes, which drafts are
-- live, homepage mode. Mislabelling a season corrupts every stat row ingested
-- under it, so writes become owner-only.
--
-- signups_open is the one routine column, but per-column tiers are impossible
-- with grants: Supabase gives every logged-in user the same `authenticated`
-- role, so revoking a column from admins revokes it from owners too. Admins
-- get a narrow SECURITY DEFINER RPC instead.

drop policy if exists league_settings_admin_write on public.league_settings;

create policy league_settings_owner_write on public.league_settings
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.set_signups_open(p_open boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if p_open is null then
    raise exception 'SIGNUPS_INVALID: pass true or false';
  end if;
  insert into public.league_settings (id, signups_open)
  values (1, p_open)
  on conflict (id) do update set signups_open = excluded.signups_open,
                                 updated_at = now();
end $$;

revoke all on function public.set_signups_open(boolean) from public;
grant execute on function public.set_signups_open(boolean) to authenticated, service_role;
