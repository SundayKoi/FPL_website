alter type public.acquisition_type add value if not exists 'admin';

create function public.admin_assign_player(
  p_draft_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_price int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
begin
  perform public._require_admin();

  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;
  if v_draft.status not in ('live', 'paused') then
    raise exception 'DRAFT_INVALID: draft is not active';
  end if;
  if exists (select 1 from public.lots where draft_id = p_draft_id and status = 'open') then
    raise exception 'LOT_OPEN_EXISTS: an auction is already running';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID: price must be a nonnegative integer';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  if p_price > v_team.points_remaining then
    raise exception 'INSUFFICIENT_POINTS: price exceeds team points';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'PLAYER_INVALID: player is not in this draft';
  end if;
  if v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player is already taken';
  end if;
  if not (v_player.role = any (public.open_roles(v_team.id))) then
    raise exception 'ROLE_FILLED: team already has that role filled';
  end if;

  update public.players
    set team_id = v_team.id, price = p_price, acquisition = 'admin'
    where id = v_player.id;
  update public.teams
    set points_remaining = points_remaining - p_price
    where id = v_team.id;

  select * into v_draft from public.drafts where id = p_draft_id;
  perform public._advance_turn(v_draft);
end $$;
