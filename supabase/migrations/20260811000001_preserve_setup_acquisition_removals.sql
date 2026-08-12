create or replace function public.admin_remove_setup_player(
  p_draft_id uuid,
  p_player_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
  v_refund int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found or v_player.team_id is null then
    raise exception 'PLAYER_INVALID: player is not an assigned setup player';
  end if;
  select * into v_team from public.teams
    where id = v_player.team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: assigned team is not in this draft';
  end if;
  if v_player.acquisition is null
     or v_player.acquisition not in ('captain', 'free_agency') then
    raise exception 'PLAYER_INVALID: player is not a removable setup prefill';
  end if;

  v_refund := coalesce(v_player.price, 0);
  update public.teams
    set points_remaining = points_remaining + v_refund
    where id = v_team.id;
  update public.players
    set team_id = null, price = null, acquisition = null
    where id = v_player.id;
end $$;

create or replace function public.admin_remove_setup_team(
  p_draft_id uuid,
  p_team_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_team public.teams;
  v_refund int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  perform 1 from public.players where team_id = v_team.id for update;
  if exists (
    select 1 from public.players
      where team_id = v_team.id
        and (acquisition is null or acquisition not in ('captain', 'free_agency'))
  ) then
    raise exception 'TEAM_INVALID: team contains non-setup acquisitions';
  end if;

  select coalesce(sum(coalesce(price, 0)), 0)::int into v_refund
    from public.players
    where team_id = v_team.id
      and acquisition in ('captain', 'free_agency');
  update public.teams
    set points_remaining = points_remaining + v_refund
    where id = v_team.id;
  update public.players
    set team_id = null, price = null, acquisition = null
    where team_id = v_team.id
      and acquisition in ('captain', 'free_agency');
  delete from public.teams where id = v_team.id;
end $$;
