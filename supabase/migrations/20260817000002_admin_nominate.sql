-- Let an admin nominate on behalf of the team on the clock.
--
-- Direct assignment already existed, but it hands the player over at a chosen
-- price and skips the auction, so nobody else gets to bid. When a captain is
-- simply absent, the league usually wants the opposite: open the lot as that
-- team and let the room bid normally.
--
-- nominate() carries real rules — the role must still be open for the
-- nominating team, the opening bid is the round minimum, and the team must keep
-- a point in hand for each of its other unfilled roles. Rather than write a
-- second copy that can drift, everything after "which team is nominating" moves
-- into _open_nomination, and both entry points call it.

create function public._open_nomination(
  p_draft_id uuid,
  p_team_id uuid,
  p_player_id uuid
) returns uuid
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
  -- Callers lock the draft row and check its status before reaching here.
  select * into v_draft from public.drafts where id = p_draft_id;
  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
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
    raise exception 'ROLE_FILLED: % already has a %', v_team.name, v_player.role;
  end if;

  v_min := v_draft.round_minimums[least(v_draft.current_round,
                                        array_length(v_draft.round_minimums, 1))];
  -- must keep 1 point per OTHER unfilled role
  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if v_min > v_cap then
    raise exception 'OVER_CAP: opening bid % exceeds a max of %', v_min, v_cap;
  end if;

  insert into public.lots (draft_id, player_id, nominated_by_team_id, round,
                           opening_bid, current_bid, leading_team_id, closes_at)
  values (p_draft_id, p_player_id, v_team.id, v_draft.current_round,
          v_min, v_min, v_team.id, now() + make_interval(secs => v_draft.countdown_seconds))
  returning id into v_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (v_lot_id, v_team.id, v_min);
  return v_lot_id;
end $$;

revoke execute on function public._open_nomination(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.nominate(p_draft_id uuid, p_player_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_team  public.teams;
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

  return public._open_nomination(p_draft_id, v_team.id, p_player_id);
end $$;

create function public.admin_nominate(p_draft_id uuid, p_player_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
begin
  perform public._require_admin();

  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then raise exception 'NOT_LIVE: draft not found'; end if;
  if v_draft.status <> 'live' then
    raise exception 'NOT_LIVE: draft is %', v_draft.status;
  end if;
  if v_draft.current_nominator_team_id is null then
    raise exception 'NO_NOMINATOR: no team is on the clock';
  end if;

  -- Deliberately nominates AS the team on the clock, so the turn order, the
  -- opening bid and the eventual sale are identical to that captain having
  -- done it themselves.
  return public._open_nomination(p_draft_id, v_draft.current_nominator_team_id, p_player_id);
end $$;

revoke all on function public.admin_nominate(uuid, uuid) from public;
grant execute on function public.admin_nominate(uuid, uuid)
  to authenticated, service_role;
