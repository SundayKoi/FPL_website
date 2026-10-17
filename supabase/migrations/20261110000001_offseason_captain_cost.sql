-- Offseason captain cost (see docs/offseason.md): staff set what each
-- captain costs when they create a week's draft, and it comes off the team's
-- budget as a setup captain's price does in the league. Before this every
-- offseason captain was free.
--
-- Adding the parameter makes a new function, so the old signature is dropped
-- and its grants restated. p_captain_cost comes last with a null default, so
-- a caller that predates it keeps working until the new site is released.

drop function public.offseason_create_week_draft(uuid, text, int, int, int[]);

create function public.offseason_create_week_draft(
  p_week_id uuid,
  p_tier text,
  p_budget int,
  p_countdown_seconds int default 15,
  p_round_minimums int[] default '{10,5,1}',
  p_captain_cost int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_event public.offseason_events;
  v_draft uuid;
  v_team uuid;
  v_player uuid;
  v_captain record;
  v_pool record;
  v_seat int := 0;
  v_abbr text;
  r public.lol_role;
  v_need int;
  v_have int;
begin
  perform public._offseason_require_staff();
  if p_tier not in ('main', 'elimination') then
    raise exception 'TIER_INVALID: tier must be main or elimination';
  end if;
  if p_budget is null or p_budget < 1 then
    raise exception 'BUDGET_INVALID: set a budget of at least 1';
  end if;
  -- A captain costs points, as in the league. The site always sends a cost;
  -- a caller that predates it gets the old free captain.
  if p_captain_cost is not null and p_captain_cost < 1 then
    raise exception 'CAPTAIN_COST_INVALID: a captain costs at least 1 point';
  end if;
  if p_captain_cost is not null and p_captain_cost > p_budget - 4 then
    raise exception 'CAPTAIN_COST_INVALID: leave at least 1 point for each of the other four roles';
  end if;
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  if v_week.status = 'complete' then
    raise exception 'WEEK_LOCKED: week % is complete', v_week.week_number;
  end if;
  if (p_tier = 'main' and v_week.main_draft_id is not null)
     or (p_tier = 'elimination' and v_week.elimination_draft_id is not null) then
    raise exception 'DRAFT_EXISTS: week % already has a % draft', v_week.week_number, p_tier;
  end if;
  select * into v_event from public.offseason_events where id = v_week.event_id;

  if (select count(*) from public.offseason_week_entries
       where week_id = p_week_id and tier = p_tier and captain_seat is not null) < 2 then
    raise exception 'CAPTAINS_REQUIRED: pick at least two % captains', p_tier;
  end if;
  if exists (
    select 1 from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is not null
      and e.profile_id is null
  ) then
    raise exception 'CAPTAIN_NOT_LINKED: every captain must have signed up on the site';
  end if;

  insert into public.drafts (name, countdown_seconds, round_minimums)
  values (
    'Offseason W' || v_week.week_number || case when p_tier = 'elimination' then ' Elimination' else '' end,
    coalesce(p_countdown_seconds, 15),
    coalesce(p_round_minimums, '{10,5,1}')
  )
  returning id into v_draft;

  for v_captain in
    select e.* from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is not null
    order by we.captain_seat
  loop
    v_seat := v_seat + 1;
    v_abbr := left(upper(regexp_replace(v_captain.display_name, '[^A-Za-z0-9]', '', 'g')), 4);
    if v_abbr = '' then v_abbr := 'T' || v_seat; end if;
    insert into public.teams (draft_id, name, abbreviation, captain_profile_id, nomination_position,
                              budget_start, points_remaining)
    values (v_draft, left('Team ' || v_captain.display_name, 64), v_abbr, v_captain.profile_id, v_seat,
            p_budget, p_budget - coalesce(p_captain_cost, 0))
    returning id into v_team;
    insert into public.players (draft_id, display_name, role, rank, opgg_url, team_id, price, acquisition)
    values (v_draft, v_captain.display_name, v_captain.assigned_role, v_captain.current_rank,
            v_captain.opgg_url, v_team, coalesce(p_captain_cost, 0), 'captain')
    returning id into v_player;
    insert into public.offseason_draft_links (draft_player_id, entrant_id) values (v_player, v_captain.id);
  end loop;

  for v_pool in
    select e.* from public.offseason_week_entries we
    join public.offseason_entrants e on e.id = we.entrant_id
    where we.week_id = p_week_id and we.tier = p_tier and we.captain_seat is null
    order by e.signed_up_at
  loop
    insert into public.players (draft_id, display_name, role, rank, opgg_url)
    values (v_draft, v_pool.display_name, v_pool.assigned_role, v_pool.current_rank, v_pool.opgg_url)
    returning id into v_player;
    insert into public.offseason_draft_links (draft_player_id, entrant_id) values (v_player, v_pool.id);
  end loop;

  -- The same coverage start_draft() will demand, said up front: every team
  -- needs one player in each role its captain does not play.
  foreach r in array enum_range(null::public.lol_role) loop
    select count(*) into v_need from public.teams t
      where t.draft_id = v_draft and r = any(public.open_roles(t.id));
    select count(*) into v_have from public.players p
      where p.draft_id = v_draft and p.role = r and p.team_id is null;
    if v_have < v_need then
      raise exception 'POOL_SHORT: % teams need a %, the % pool has %', v_need, r, p_tier, v_have;
    end if;
  end loop;

  if p_tier = 'main' then
    update public.offseason_weeks set main_draft_id = v_draft, status = 'drafting' where id = p_week_id;
  else
    update public.offseason_weeks set elimination_draft_id = v_draft, status = 'drafting' where id = p_week_id;
  end if;
  return v_draft;
end $$;

revoke all on function public.offseason_create_week_draft(uuid, text, int, int, int[], int) from public;
grant execute on function public.offseason_create_week_draft(uuid, text, int, int, int[], int) to authenticated;
