-- Let the nominator open above the round minimum.
--
-- The minimum was also the opening bid, so round one always started at 10 even
-- when the nominator wanted to price a player out of reach. Now the amount is
-- theirs to choose: at least the round minimum, at most the same cap that
-- limits any bid (their points, less a point held back for each of their other
-- unfilled roles).
--
-- The parameter is added with a default so an omitted amount still means "round
-- minimum". Adding it creates a NEW signature rather than replacing the old
-- one, so the two-argument forms are dropped first — leaving both would make
-- every two-argument call ambiguous and error.

drop function public.nominate(uuid, uuid);
drop function public.admin_nominate(uuid, uuid);
drop function public._open_nomination(uuid, uuid, uuid);

create function public._open_nomination(
  p_draft_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_opening_bid int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_draft  public.drafts;
  v_team   public.teams;
  v_player public.players;
  v_open   public.lol_role[];
  v_min    int;
  v_cap    int;
  v_bid    int;
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
  -- No amount given means the round minimum, which is what nominating did
  -- before this parameter existed.
  v_bid := coalesce(p_opening_bid, v_min);
  if v_bid < v_min then
    raise exception 'UNDER_MINIMUM: round % opens at % or more', v_draft.current_round, v_min;
  end if;

  -- must keep 1 point per OTHER unfilled role
  v_cap := v_team.points_remaining - (cardinality(v_open) - 1);
  if v_bid > v_cap then
    raise exception 'OVER_CAP: opening bid % exceeds a max of %', v_bid, v_cap;
  end if;

  insert into public.lots (draft_id, player_id, nominated_by_team_id, round,
                           opening_bid, current_bid, leading_team_id, closes_at)
  values (p_draft_id, p_player_id, v_team.id, v_draft.current_round,
          v_bid, v_bid, v_team.id, now() + make_interval(secs => v_draft.countdown_seconds))
  returning id into v_lot_id;

  insert into public.bids (lot_id, team_id, amount) values (v_lot_id, v_team.id, v_bid);
  return v_lot_id;
end $$;

revoke execute on function public._open_nomination(uuid, uuid, uuid, int)
  from public, anon, authenticated;

create function public.nominate(
  p_draft_id uuid,
  p_player_id uuid,
  p_opening_bid int default null
) returns uuid
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

  return public._open_nomination(p_draft_id, v_team.id, p_player_id, p_opening_bid);
end $$;

create function public.admin_nominate(
  p_draft_id uuid,
  p_player_id uuid,
  p_opening_bid int default null
) returns uuid
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

  return public._open_nomination(p_draft_id, v_draft.current_nominator_team_id,
                                 p_player_id, p_opening_bid);
end $$;

-- Grants died with the dropped functions, so re-establish them.
revoke all on function public.nominate(uuid, uuid, int) from public;
grant execute on function public.nominate(uuid, uuid, int)
  to authenticated, service_role;

revoke all on function public.admin_nominate(uuid, uuid, int) from public;
grant execute on function public.admin_nominate(uuid, uuid, int)
  to authenticated, service_role;
