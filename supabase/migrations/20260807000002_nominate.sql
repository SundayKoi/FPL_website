create function public.nominate(p_draft_id uuid, p_player_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_draft  public.drafts;
  v_team   public.teams;
  v_player public.players;
  v_open   public.lol_role[];
  v_min    int;
  v_cap    int;
  v_lot_id uuid;
begin
  -- Lock the draft row: serializes nominate/close/pause for this draft.
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then raise exception 'NOT_LIVE: draft not found'; end if;
  if v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is %', v_draft.status;
  end if;

  v_team := public.caller_team(p_draft_id);
  if v_team.id <> v_draft.current_nominator_team_id then
    raise exception 'NOT_YOUR_TURN: it is not your nomination';
  end if;

  if exists (select 1 from public.lots where draft_id = p_draft_id and status = 'open') then
    raise exception 'LOT_OPEN_EXISTS: an auction is already running';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id;
  if not found or v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player unavailable';
  end if;

  v_open := public.open_roles(v_team.id);
  if not (v_player.role = any (v_open)) then
    raise exception 'ROLE_FILLED: you already have a %', v_player.role;
  end if;

  v_min := v_draft.round_minimums[least(v_draft.current_round,
                                        array_length(v_draft.round_minimums, 1))];
  -- must keep 1 point per OTHER unfilled role
  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if v_min > v_cap then
    raise exception 'OVER_CAP: opening bid % exceeds your max of %', v_min, v_cap;
  end if;

  insert into public.lots (draft_id, player_id, nominated_by_team_id, round,
                           opening_bid, current_bid, leading_team_id, closes_at)
  values (p_draft_id, p_player_id, v_team.id, v_draft.current_round,
          v_min, v_min, v_team.id, now() + make_interval(secs => v_draft.countdown_seconds))
  returning id into v_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (v_lot_id, v_team.id, v_min);
  return v_lot_id;
end $$;
