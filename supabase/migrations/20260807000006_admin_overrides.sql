create function public.cancel_lot(p_lot_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lot public.lots;
begin
  perform public._require_admin();
  perform 1 from public.drafts d join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  select * into v_lot from public.lots where id = p_lot_id for update;
  if not found or v_lot.status <> 'open' then
    raise exception 'LOT_CLOSED: lot is not open';
  end if;
  update public.lots set status = 'cancelled', closed_at = now() where id = p_lot_id;
  -- nominator keeps the turn: current_nominator_team_id untouched
end $$;

create function public.force_close_lot(p_lot_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  return public._close_lot(p_lot_id, true);
end $$;

create function public.undo_last_sale(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lot public.lots;
begin
  perform public._require_admin();
  perform 1 from public.drafts where id = p_draft_id for update;

  select * into v_lot from public.lots
    where draft_id = p_draft_id and status = 'sold'
    order by closed_at desc limit 1
    for update;
  if not found then raise exception 'LOT_CLOSED: nothing to undo'; end if;

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
