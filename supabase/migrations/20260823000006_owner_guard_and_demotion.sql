-- Staff tiers, step 1: trimming the owner set.
--
-- 20260817000001 seeded every then-current admin as an owner, so "owner" does
-- not yet mean what it should. This demotes everyone except the two site
-- creators. is_admin is deliberately untouched: a demoted owner keeps every
-- admin power, they just stop being able to change league-shaping config.

do $$
declare v_owners int;
begin
  -- A database with no profiles at all (a fresh reset) has nothing to demote.
  if not exists (select 1 from public.profiles where is_owner) then
    raise notice 'No owners present; skipping demotion.';
    return;
  end if;

  update public.profiles
  set is_owner = false
  where is_owner
    and lower(trim(display_name)) not in ('dribb', 'spiesss');

  select count(*) into v_owners from public.profiles where is_owner;
  if v_owners <> 2 then
    raise exception
      'Expected exactly 2 owners after demotion, found %. Check profiles.display_name for dribb and spiesss.',
      v_owners;
  end if;
end $$;
