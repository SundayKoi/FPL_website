-- Forced-outcome auto-assign: when exactly ONE unassigned player remains in a
-- role and exactly ONE team still needs that role, the auction outcome is
-- already decided — assign the player for 1 point instead of running a
-- one-bidder lot. Cascades (an assignment can create the next forced pair)
-- and posts a system line to the board chat. Runs after every lot closes,
-- before the nomination turn advances.

create function public._auto_assign_forced(p_draft_id uuid) returns void
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

    -- a role with exactly one unassigned player and exactly one team missing it
    select r.role into v_role
      from (
        select p.role,
               count(*) as pool
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
      set team_id = v_team.id, price = 1, acquisition = 'auction'
      where id = v_player.id;
    update public.teams
      set points_remaining = points_remaining - 1
      where id = v_team.id;

    perform public._draft_system_message(p_draft_id,
      '⚡ ' || v_player.display_name || ' → ' || v_team.name ||
      ' for 1 point — last ' || upper(v_role::text) || ' on the board');
  end loop;
end $$;

revoke execute on function public._auto_assign_forced(uuid)
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

  perform public._auto_assign_forced(v_draft.id);

  select * into v_draft from public.drafts where id = v_draft.id;  -- re-read post-sale
  perform public._advance_turn(v_draft);
  return true;
end $$;
