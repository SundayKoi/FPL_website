-- Offseason lock-in (see docs/offseason.md): once staff have assigned roles,
-- each player confirms they are playing and accept the role they were given.
--
-- A lock-in records the role it accepted. It counts only while that is still
-- the player's assigned role, so if staff move a player to another role the
-- player has to lock in again. Nothing clears it: the app compares the two.
--
-- A player locks in through offseason_lock_in() only. Staff may also record
-- a lock-in by hand (a player who confirmed in Discord) through the existing
-- staff write policy on offseason_entrants.

alter table public.offseason_entrants
  add column locked_in_role public.lol_role,
  add column locked_in_at timestamptz,
  add constraint offseason_entrants_lock_in_pair
    check ((locked_in_role is null) = (locked_in_at is null));

-- The signed-in player locks in their own entry for the role they were shown.
-- p_role must still be their assigned role, so a lock-in never accepts a role
-- the player did not see.
--
-- A player staff added by hand has no account yet. Passing that row's Riot ID
-- links it to the caller first, the same claim offseason_sign_up() makes, so
-- they can lock in after sign-ups close. The claim only happens if the
-- lock-in succeeds.
create function public.offseason_lock_in(
  p_event_id uuid,
  p_role public.lol_role,
  p_riot_id text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_riot text := btrim(coalesce(p_riot_id, ''));
  v_event public.offseason_events;
  v_entrant public.offseason_entrants;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to lock in';
  end if;
  select * into v_event from public.offseason_events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND: no such event';
  end if;
  if v_event.status = 'complete' then
    raise exception 'EVENT_COMPLETE: the event is over';
  end if;

  select * into v_entrant from public.offseason_entrants
    where event_id = p_event_id and profile_id = v_uid for update;
  if not found then
    if v_riot = '' then
      raise exception 'NOT_ENTERED: you are not signed up for this event';
    end if;
    select * into v_entrant from public.offseason_entrants
      where event_id = p_event_id and lower(riot_id) = lower(v_riot) for update;
    if not found then
      raise exception 'NOT_ENTERED: nobody is signed up with that Riot ID';
    end if;
    if v_entrant.profile_id is not null then
      raise exception 'RIOT_ID_TAKEN: that Riot ID belongs to another account';
    end if;
    update public.offseason_entrants set profile_id = v_uid where id = v_entrant.id;
  end if;

  if v_entrant.status = 'benched' then
    raise exception 'NOT_PLAYING: you are sitting out this event';
  end if;
  if v_entrant.status <> 'active' then
    raise exception 'NOT_PLAYING: you are %', v_entrant.status;
  end if;
  if v_entrant.assigned_role is null then
    raise exception 'NO_ROLE: roles have not been assigned yet';
  end if;
  if p_role is distinct from v_entrant.assigned_role then
    raise exception 'ROLE_CHANGED: your role has changed, check it and lock in again';
  end if;

  update public.offseason_entrants
    set locked_in_role = v_entrant.assigned_role, locked_in_at = now()
    where id = v_entrant.id;
  return v_entrant.id;
end $$;

revoke all on function public.offseason_lock_in(uuid, public.lol_role, text) from public, anon;
grant execute on function public.offseason_lock_in(uuid, public.lol_role, text) to authenticated;
