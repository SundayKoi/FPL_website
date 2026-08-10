-- Serialize turn-changing sales and direct assignments with a per-draft
-- sequence. Unlike timestamps, this remains deterministic for rapid actions
-- and lets undo distinguish assignments before and after the latest sale.
alter table public.drafts
  add column last_action_sequence bigint not null default 0,
  add column last_direct_assignment_sequence bigint;

alter table public.lots
  add column sale_action_sequence bigint;

create function public._record_sale_action_sequence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.drafts
    set last_action_sequence = last_action_sequence + 1
    where id = new.draft_id
    returning last_action_sequence into new.sale_action_sequence;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;
  return new;
end $$;

create trigger lots_record_sale_action_sequence
  before update of status on public.lots
  for each row
  when (old.status is distinct from new.status and new.status = 'sold')
  execute function public._record_sale_action_sequence();

create or replace function public.admin_assign_player(
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
  update public.drafts
    set last_action_sequence = last_action_sequence + 1,
        last_direct_assignment_sequence = last_action_sequence + 1
    where id = p_draft_id
    returning * into v_draft;

  perform public._advance_turn(v_draft);
end $$;

create or replace function public.undo_last_sale(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_lot public.lots;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  select * into v_lot from public.lots
    where draft_id = p_draft_id and status = 'sold'
    order by coalesce(sale_action_sequence, 0) desc,
             closed_at desc,
             created_at desc
    limit 1
    for update;
  if not found then
    raise exception 'LOT_CLOSED: nothing to undo';
  end if;
  if v_draft.last_direct_assignment_sequence is not null
     and v_draft.last_direct_assignment_sequence > coalesce(v_lot.sale_action_sequence, 0) then
    raise exception 'UNDO_BLOCKED_NEWER_ASSIGNMENT: a newer direct assignment must remain in place';
  end if;

  update public.lots set status = 'cancelled' where id = v_lot.id;
  update public.players set team_id = null, price = null, acquisition = null
    where id = v_lot.player_id;
  update public.teams set points_remaining = points_remaining + v_lot.current_bid
    where id = v_lot.leading_team_id;
  update public.drafts
    set current_round = v_lot.round,
        current_nominator_team_id = v_lot.nominated_by_team_id,
        status = case when status in ('complete','live') then 'live' else status end
    where id = p_draft_id;
end $$;

create function public.admin_set_setup_team_budget(
  p_draft_id uuid,
  p_team_id uuid,
  p_budget int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_team public.teams;
  v_committed_spend int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;
  if p_budget is null or p_budget < 0 then
    raise exception 'BUDGET_INVALID: budget must be a nonnegative integer';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  perform 1 from public.players where team_id = v_team.id for update;
  select coalesce(sum(coalesce(price, 0)), 0)::int into v_committed_spend
    from public.players where team_id = v_team.id;
  if p_budget < v_committed_spend then
    raise exception 'BUDGET_BELOW_SPEND: budget is below committed setup spend';
  end if;

  update public.teams
    set budget_start = p_budget,
        points_remaining = p_budget - v_committed_spend
    where id = v_team.id;
end $$;

create function public.admin_remove_setup_player(
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

  v_refund := coalesce(v_player.price, 0);
  if v_player.acquisition = 'free_agency' then
    update public.teams
      set points_remaining = points_remaining + v_refund
      where id = v_team.id;
    update public.players
      set team_id = null, price = null, acquisition = null
      where id = v_player.id;
  elsif v_player.acquisition = 'captain' then
    update public.teams
      set points_remaining = points_remaining + v_refund
      where id = v_team.id;
    delete from public.players where id = v_player.id;
  else
    raise exception 'PLAYER_INVALID: player is not a removable setup prefill';
  end if;
end $$;

create function public.admin_remove_setup_team(
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
    where team_id = v_team.id and acquisition = 'free_agency';
  update public.teams
    set points_remaining = points_remaining + v_refund
    where id = v_team.id;
  update public.players
    set team_id = null, price = null, acquisition = null
    where team_id = v_team.id and acquisition = 'free_agency';
  delete from public.players
    where team_id = v_team.id and acquisition = 'captain';
  delete from public.teams where id = v_team.id;
end $$;

revoke all on function public.admin_assign_player(uuid, uuid, uuid, int) from public;
revoke all on function public.admin_assign_setup_player(uuid, uuid, uuid, int) from public;
revoke all on function public.admin_set_setup_team_budget(uuid, uuid, int) from public;
revoke all on function public.admin_remove_setup_player(uuid, uuid) from public;
revoke all on function public.admin_remove_setup_team(uuid, uuid) from public;
grant execute on function public.admin_assign_player(uuid, uuid, uuid, int)
  to authenticated, service_role;
grant execute on function public.admin_assign_setup_player(uuid, uuid, uuid, int)
  to authenticated, service_role;
grant execute on function public.admin_set_setup_team_budget(uuid, uuid, int)
  to authenticated, service_role;
grant execute on function public.admin_remove_setup_player(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.admin_remove_setup_team(uuid, uuid)
  to authenticated, service_role;

revoke execute on function public._record_sale_action_sequence()
  from public, anon, authenticated;
