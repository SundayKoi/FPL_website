create function public.place_bid(p_lot_id uuid, p_amount int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lot   public.lots;
  v_draft public.drafts;
  v_team  public.teams;
  v_open  public.lol_role[];
  v_role  public.lol_role;
  v_cap   int;
begin
  -- Lock order everywhere is draft -> lot, so bids, closes and pauses serialize.
  select d.* into v_draft from public.drafts d
    join public.lots l on l.draft_id = d.id
    where l.id = p_lot_id for update of d;
  if not found then raise exception 'LOT_CLOSED: lot not found'; end if;
  if v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is %', v_draft.status;
  end if;

  select * into v_lot from public.lots where id = p_lot_id for update;
  if v_lot.status <> 'open' then raise exception 'LOT_CLOSED: auction over'; end if;
  if now() >= v_lot.closes_at then raise exception 'LOT_EXPIRED: countdown finished'; end if;

  v_team := public.caller_team(v_lot.draft_id);
  if v_team.id = v_lot.leading_team_id then
    raise exception 'ALREADY_LEADING: you hold the high bid';
  end if;

  select role into v_role from public.players where id = v_lot.player_id;
  v_open := public.open_roles(v_team.id);
  if not (v_role = any (v_open)) then
    raise exception 'ROLE_FILLED: you already have a %', v_role;
  end if;

  if p_amount < v_lot.current_bid + 1 then
    raise exception 'BID_TOO_LOW: minimum is %', v_lot.current_bid + 1;
  end if;

  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if p_amount > v_cap then
    raise exception 'OVER_CAP: your max bid is %', v_cap;
  end if;

  update public.lots
    set current_bid = p_amount,
        leading_team_id = v_team.id,
        closes_at = now() + make_interval(secs => v_draft.countdown_seconds)
    where id = p_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (p_lot_id, v_team.id, p_amount);
end $$;
