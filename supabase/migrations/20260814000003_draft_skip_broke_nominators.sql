-- Skip teams that can't afford to open a lot when picking the next nominator.
-- A team must keep 1 point per OTHER unfilled role (nominate's own cap rule),
-- so the affordability test for round minimum M is:
--   points_remaining - (open_roles - 1) >= M
-- If a whole pass has nobody who can afford the current round's minimum, the
-- round advances (minimums step down, e.g. {10,5,1}); the engine's 1-point-
-- per-open-slot reserve means every team can afford the schedule's floor, so
-- a nominator is always found while any team still has open roles.

create or replace function public._advance_turn(p_draft public.drafts) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cur_pos int;
  v_round int := p_draft.current_round;
  v_asc boolean;
  v_next uuid;
  v_next_pos int;
  v_min int;
  v_skipped text;
begin
  select nomination_position into v_cur_pos
    from public.teams where id = p_draft.current_nominator_team_id;

  v_asc := (v_round % 2) = 1;   -- round 1,3,5.. ascend; 2,4.. descend
  v_min := p_draft.round_minimums[least(v_round, array_length(p_draft.round_minimums, 1))];

  -- next team after current position in the travel direction that has open
  -- roles AND can afford to open a lot at this round's minimum
  select t.id, t.nomination_position into v_next, v_next_pos from public.teams t
    where t.draft_id = p_draft.id
      and cardinality(public.open_roles(t.id)) > 0
      and t.points_remaining - (cardinality(public.open_roles(t.id)) - 1) >= v_min
      and ((v_asc and t.nomination_position > v_cur_pos)
        or (not v_asc and t.nomination_position < v_cur_pos))
    order by case when v_asc then t.nomination_position end asc,
             case when not v_asc then t.nomination_position end desc
    limit 1;

  if v_next is not null then
    -- name only the teams actually passed over: strictly between the old and
    -- new nominator in the travel direction, with open roles, unaffordable
    select string_agg(t.name, ', ' order by t.nomination_position) into v_skipped
      from public.teams t
      where t.draft_id = p_draft.id
        and cardinality(public.open_roles(t.id)) > 0
        and t.points_remaining - (cardinality(public.open_roles(t.id)) - 1) < v_min
        and ((v_asc and t.nomination_position > v_cur_pos and t.nomination_position < v_next_pos)
          or (not v_asc and t.nomination_position < v_cur_pos and t.nomination_position > v_next_pos));
    if v_skipped is not null then
      perform public._draft_system_message(p_draft.id,
        '⏭️ ' || v_skipped || ' skipped — can''t open a ' || v_min || '-point lot this round');
    end if;
  end if;

  -- pass exhausted -> advance rounds until someone can afford that round's
  -- minimum. Bounded: once the minimum reaches the schedule's floor, the
  -- 1-point-per-open-slot reserve guarantees any team with open roles
  -- qualifies, so this finds a nominator or there are no open roles at all.
  while v_next is null
    and exists (select 1 from public.teams t
                where t.draft_id = p_draft.id
                  and cardinality(public.open_roles(t.id)) > 0)
  loop
    v_round := v_round + 1;
    v_asc := (v_round % 2) = 1;
    v_min := p_draft.round_minimums[least(v_round, array_length(p_draft.round_minimums, 1))];
    select t.id into v_next from public.teams t
      where t.draft_id = p_draft.id
        and cardinality(public.open_roles(t.id)) > 0
        and t.points_remaining - (cardinality(public.open_roles(t.id)) - 1) >= v_min
      order by case when v_asc then t.nomination_position end asc,
               case when not v_asc then t.nomination_position end desc
      limit 1;
  end loop;

  if v_next is null then
    update public.drafts set status = 'complete', current_nominator_team_id = null
      where id = p_draft.id;
  else
    update public.drafts
      set current_round = v_round, current_nominator_team_id = v_next
      where id = p_draft.id;
  end if;
end $$;
