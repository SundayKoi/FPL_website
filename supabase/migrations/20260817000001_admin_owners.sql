-- Two-tier staff access.
--
-- Until now `profiles.is_admin` was the whole model, and it could only be set
-- from the SQL editor (profiles has a public-read policy and no write grant to
-- `authenticated`). That is safe but means every new admin needs a database
-- trip. Owners can now grant and revoke admin from the site.
--
-- The split: an OWNER may make and unmake admins. An ADMIN has every existing
-- admin power but cannot change anyone's access, so a granted admin can never
-- mint more admins or promote themselves. No RPC creates owners — the owner set
-- is seeded here from the current admins and afterwards only changeable in the
-- database, which is deliberate: it makes owner escalation unreachable from the
-- application and makes lockout impossible (nobody can demote the last owner).

alter table public.profiles
  add column is_owner boolean not null default false;

-- The people who are admins at this moment are the founding owners.
update public.profiles set is_owner = true where is_admin;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from public.profiles where id = auth.uid()), false)
$$;

create function public.set_profile_admin(
  p_profile_id uuid,
  p_is_admin boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target public.profiles;
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: only a league owner can change admin access';
  end if;
  if p_is_admin is null then
    raise exception 'ADMIN_INVALID: pass true or false';
  end if;

  select * into v_target from public.profiles
    where id = p_profile_id for update;
  if not found then
    raise exception 'PROFILE_INVALID: profile not found';
  end if;
  -- Covers an owner acting on themselves, so the RPC can never strip the
  -- access that guards it.
  if v_target.is_owner then
    raise exception 'OWNER_PROTECTED: owner access is managed in the database';
  end if;

  update public.profiles set is_admin = p_is_admin where id = v_target.id;
end $$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated, service_role;

revoke all on function public.set_profile_admin(uuid, boolean) from public;
grant execute on function public.set_profile_admin(uuid, boolean)
  to authenticated, service_role;
