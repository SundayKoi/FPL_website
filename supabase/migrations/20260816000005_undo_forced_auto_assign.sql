-- Forced auto-assignments (20260814000004) hand out the last player in a role
-- with no lot behind them, which made them permanent: undo_last_sale only ever
-- reversed lots. Worse, undoing the sale that CAUSED a cascade left the
-- auto-assigned players on their teams -- a board state nothing else can reach.
--
-- Stamp each auto-assignment with the lot whose closure forced it, then reverse
-- the cascade with the sale.
--
-- ON DELETE SET NULL matches the rule from 20260814000006_draft_delete_cascades:
-- lots_player_id_fkey cascades a lot away when its own player is deleted (e.g.
-- PlayerPoolEditor removing a player), and a deleted lot has nothing left to
-- undo -- the stamped player should just lose the dangling reference, not
-- block the delete with a raw FK violation.

alter table public.players
  add column auto_assigned_from_lot_id uuid
    references public.lots(id) on delete set null;

-- The parameter list changes, so this is a NEW function rather than a replace.
-- Drop the old one or _close_lot could keep calling a version that stamps
-- nothing, leaving auto-assignments unreversible while looking reversible.
drop function public._auto_assign_forced(uuid);

create function public._auto_assign_forced(p_draft_id uuid, p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.lol_role;
  v_player public.players;
  v_team public.teams;
  v_guard int := 0;
begin
  loop
    v_guard := v_guard + 1;
    exit when v_guard > 10;  -- 5 roles; cascade can never exceed the pool

    select r.role into v_role
      from (
        select p.role, count(*) as pool
          from public.players p
          where p.draft_id = p_draft_id and p.team_id is null
          group by p.role
      ) r
      where r.pool = 1
        and (select count(*) from public.teams t
             where t.draft_id = p_draft_id
               and r.role = any (public.open_roles(t.id))) = 1
      limit 1;
    exit when v_role is null;

    select * into v_player from public.players
      where draft_id = p_draft_id and team_id is null and role = v_role
      limit 1;
    select t.* into v_team from public.teams t
      where t.draft_id = p_draft_id and v_role = any (public.open_roles(t.id))
      limit 1;

    update public.players
      set team_id = v_team.id, price = 1, acquisition = 'auction',
          auto_assigned_from_lot_id = p_lot_id
      where id = v_player.id;
    update public.teams
      set points_remaining = points_remaining - 1
      where id = v_team.id;

    perform public._draft_system_message(p_draft_id,
      '⚡ ' || v_player.display_name || ' → ' || v_team.name ||
      ' for 1 point — last ' || upper(v_role::text) || ' on the board');
  end loop;
end $$;

revoke execute on function public._auto_assign_forced(uuid, uuid)
  from public, anon, authenticated;

-- Hook into lot close: sale happens, forced pairs settle, then the turn moves
-- (the advance naturally skips teams the auto-assign just completed).
create or replace function public._close_lot(p_lot_id uuid, p_force boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_lot   public.lots;
  v_draft public.drafts;
begin
  select d.* into v_draft from public.drafts d
    join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  if not found then return false; end if;
  if v_draft.status <> 'live' then return false; end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if v_lot.status <> 'open' then return false; end if;
  if not p_force and now() < v_lot.closes_at then return false; end if;

  update public.lots set status = 'sold', closed_at = now() where id = p_lot_id;

  update public.players
    set team_id = v_lot.leading_team_id, price = v_lot.current_bid, acquisition = 'auction'
    where id = v_lot.player_id;

  update public.teams
    set points_remaining = points_remaining - v_lot.current_bid
    where id = v_lot.leading_team_id;

  perform public._auto_assign_forced(v_draft.id, p_lot_id);

  select * into v_draft from public.drafts where id = v_draft.id;  -- re-read post-sale
  perform public._advance_turn(v_draft);
  return true;
end $$;

create or replace function public.undo_last_sale(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_lot public.lots;
  v_forced text;
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

  -- Reverse the cascade this sale forced, before the sale itself. Aggregate
  -- refunds per team before the join: `UPDATE ... FROM` collapses to one
  -- arbitrary source row per target row when the join yields several source
  -- rows for it, so a plain per-player join under-pays a team that received
  -- two or more cascaded players from this same lot.
  select string_agg(display_name, ', ') into v_forced
    from public.players where auto_assigned_from_lot_id = v_lot.id;
  update public.teams t
    set points_remaining = t.points_remaining + agg.refund
    from (
      select team_id, sum(coalesce(price, 0)) as refund
        from public.players
        where auto_assigned_from_lot_id = v_lot.id
        group by team_id
    ) agg
    where agg.team_id = t.id;
  update public.players
    set team_id = null, price = null, acquisition = null, auto_assigned_from_lot_id = null
    where auto_assigned_from_lot_id = v_lot.id;
  if v_forced is not null then
    perform public._draft_system_message(p_draft_id,
      '↩️ Undo also returned ' || v_forced || ' to the pool');
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
