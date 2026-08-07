-- Advance nomination after a sale. p_draft must be freshly re-read AFTER the
-- sale's roster mutation, and its row must already be locked by the caller.
create function public._advance_turn(p_draft public.drafts) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cur_pos int;
  v_round int := p_draft.current_round;
  v_asc boolean;
  v_next uuid;
begin
  select nomination_position into v_cur_pos
    from public.teams where id = p_draft.current_nominator_team_id;

  v_asc := (v_round % 2) = 1;   -- round 1,3,5.. ascend; 2,4.. descend

  -- next eligible team after current position in the current direction
  select t.id into v_next from public.teams t
    where t.draft_id = p_draft.id
      and cardinality(public.open_roles(t.id)) > 0
      and ((v_asc and t.nomination_position > v_cur_pos)
        or (not v_asc and t.nomination_position < v_cur_pos))
    order by case when v_asc then t.nomination_position end asc,
             case when not v_asc then t.nomination_position end desc
    limit 1;

  if v_next is null then
    -- pass complete -> next round, direction flips, start from that end
    v_round := v_round + 1;
    v_asc := (v_round % 2) = 1;
    select t.id into v_next from public.teams t
      where t.draft_id = p_draft.id
        and cardinality(public.open_roles(t.id)) > 0
      order by case when v_asc then t.nomination_position end asc,
               case when not v_asc then t.nomination_position end desc
      limit 1;
  end if;

  if v_next is null then
    update public.drafts set status = 'complete', current_nominator_team_id = null
      where id = p_draft.id;
  else
    update public.drafts
      set current_round = v_round, current_nominator_team_id = v_next
      where id = p_draft.id;
  end if;
end $$;

create function public._close_lot(p_lot_id uuid, p_force boolean) returns boolean
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

  select * into v_draft from public.drafts where id = v_draft.id;  -- re-read post-sale
  perform public._advance_turn(v_draft);
  return true;
end $$;

-- Public wrapper: anyone may poke an expired lot closed; never forces.
create function public.close_lot(p_lot_id uuid) returns boolean
language sql security definer set search_path = public as $$
  select public._close_lot(p_lot_id, false)
$$;
