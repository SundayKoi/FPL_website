revoke execute on function public.admin_assign_setup_player(uuid, uuid, uuid, int)
  from authenticated, service_role;
revoke all on function public.admin_assign_setup_player(uuid, uuid, uuid, int)
  from public;
drop function public.admin_assign_setup_player(uuid, uuid, uuid, int);

create function public.admin_assign_setup_player(
  p_draft_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_price int,
  p_acquisition text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID: price must be a nonnegative integer';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'PLAYER_INVALID: player is not in this draft';
  end if;
  if v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player is already assigned';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  if (select count(*) from public.players where team_id = v_team.id) >= 2 then
    raise exception 'SETUP_FULL: team already has two pre-filled players';
  end if;
  if not (v_player.role = any (public.open_roles(v_team.id))) then
    raise exception 'ROLE_FILLED: team already has that role filled';
  end if;
  if p_price > v_team.points_remaining then
    raise exception 'INSUFFICIENT_POINTS: price exceeds team points';
  end if;
  if p_acquisition is null or p_acquisition not in ('captain', 'free_agency') then
    raise exception 'SETUP_ACQUISITION_INVALID: setup acquisition must be captain or free_agency';
  end if;
  if exists (
    select 1 from public.players
    where team_id = v_team.id and acquisition = p_acquisition::public.acquisition_type
  ) then
    raise exception 'SETUP_ACQUISITION_TAKEN: team already has this setup acquisition';
  end if;

  update public.players
    set team_id = v_team.id,
        price = p_price,
        acquisition = p_acquisition::public.acquisition_type
    where id = v_player.id;
  update public.teams
    set points_remaining = points_remaining - p_price
    where id = v_team.id;
end $$;

revoke all on function public.admin_assign_setup_player(uuid, uuid, uuid, int, text)
  from public;
grant execute on function public.admin_assign_setup_player(uuid, uuid, uuid, int, text)
  to authenticated, service_role;
