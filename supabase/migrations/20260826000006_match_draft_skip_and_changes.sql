-- Timer skips and change requests.
--
-- 1. Advancement becomes "next empty step" (instead of blind +1) so a step
--    freed by an approved change request gets re-drafted and the pointer
--    then jumps back past the steps already locked.
-- 2. skip_match_draft_step records a champion-less "skipped" action once the
--    turn clock has truly expired (server-checked against turn_started_at).
-- 3. A captain can request to change one of their own locked/skipped steps;
--    the opposing captain (or an admin) approves — which reopens exactly
--    that step — or denies. One pending request at a time.
-- 4. undo_match_draft_last gives admins a one-step rollback.

alter table public.match_drafts
  add column if not exists change_request jsonb;

-- Smallest step (0-19) with no recorded action; null when the draft is full.
create or replace function public.match_draft_next_step(p_actions jsonb) returns int
language sql immutable as $$
  select i from generate_series(0, 19) i
  where not exists (
    select 1 from jsonb_array_elements(p_actions) a
    where (a->>'stepIndex')::int = i
  )
  order by i
  limit 1
$$;

-- Re-created with next-empty advancement and champion-null tolerance in the
-- duplicate check (skipped actions store champion: null).
create or replace function public.apply_match_draft_action(
  p_fixture uuid,
  p_game int,
  p_step int,
  p_champion text,
  p_player_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sides constant text[] := array[
    'blue','red','blue','red','blue','red',
    'blue','red','red','blue','blue','red',
    'red','blue','red','blue',
    'red','blue','blue','red'];
  v_kinds constant text[] := array[
    'ban','ban','ban','ban','ban','ban',
    'pick','pick','pick','pick','pick','pick',
    'ban','ban','ban','ban',
    'pick','pick','pick','pick'];
  v_slots constant int[] := array[1,1,2,2,3,3, 1,1,2,2,3,3, 4,4,5,5, 4,4,5,5];
  v_admin boolean := public.is_admin();
  v_caller_side text;
  v_step_side text;
  v_row public.match_drafts;
  v_fearless boolean;
  v_actions jsonb;
  v_next int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin to draft';
  end if;
  if p_game < 1 or p_game > 5 or p_step < 0 or p_step > 19 or coalesce(trim(p_champion), '') = '' then
    raise exception 'BAD_REQUEST: invalid draft action';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found then
    insert into public.match_drafts (fixture_id, game_number)
    values (p_fixture, p_game)
    returning * into v_row;
  end if;

  if v_row.status = 'complete' then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if coalesce(public.match_draft_next_step(v_row.actions), 20) <> p_step then
    raise exception 'OUT_OF_TURN: that step is not up';
  end if;
  if not (v_row.blue_ready and v_row.red_ready) then
    raise exception 'NOT_READY: both teams must ready up first';
  end if;

  v_step_side := v_sides[p_step + 1];
  if not v_admin then
    v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can draft';
    end if;
    if v_caller_side <> v_step_side then
      raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_step_side;
    end if;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_row.actions) a
    where a->>'champion' is not null
      and lower(trim(a->>'champion')) = lower(trim(p_champion))
  ) then
    raise exception 'CHAMPION_TAKEN: % is already picked or banned this game', p_champion;
  end if;

  select coalesce(s.fearless, true) into v_fearless
    from public.match_draft_settings s where s.fixture_id = p_fixture;
  if coalesce(v_fearless, true) and exists (
    select 1
    from public.match_drafts d2, jsonb_array_elements(d2.actions) a
    where d2.fixture_id = p_fixture
      and d2.game_number < p_game
      and a->>'kind' = 'pick'
      and a->>'champion' is not null
      and lower(trim(a->>'champion')) = lower(trim(p_champion))
  ) then
    raise exception 'FEARLESS_BLOCKED: % was already picked earlier in this series', p_champion;
  end if;

  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', p_step,
    'side', v_step_side,
    'kind', v_kinds[p_step + 1],
    'slot', v_slots[p_step + 1],
    'champion', trim(p_champion),
    'playerName', p_player_name);
  v_next := public.match_draft_next_step(v_actions);

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = now()
  where id = v_row.id;
end $$;

-- Expired turn: anyone involved in the match (either captain, or an admin)
-- can skip the current step once the 30s clock plus a 3s grace has passed.
create or replace function public.skip_match_draft_step(
  p_fixture uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sides constant text[] := array[
    'blue','red','blue','red','blue','red',
    'blue','red','red','blue','blue','red',
    'red','blue','red','blue',
    'red','blue','blue','red'];
  v_kinds constant text[] := array[
    'ban','ban','ban','ban','ban','ban',
    'pick','pick','pick','pick','pick','pick',
    'ban','ban','ban','ban',
    'pick','pick','pick','pick'];
  v_slots constant int[] := array[1,1,2,2,3,3, 1,1,2,2,3,3, 4,4,5,5, 4,4,5,5];
  v_row public.match_drafts;
  v_step int;
  v_actions jsonb;
  v_next int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;
  if not public.is_admin() and public.match_draft_caller_side(p_fixture, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can skip a turn';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found or v_row.status = 'complete' then return; end if;
  if not (v_row.blue_ready and v_row.red_ready) then return; end if;
  if v_row.turn_started_at is null
     or now() - v_row.turn_started_at < interval '33 seconds' then
    raise exception 'TOO_SOON: the turn clock has not expired yet';
  end if;

  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then return; end if;

  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', v_step,
    'side', v_sides[v_step + 1],
    'kind', v_kinds[v_step + 1],
    'slot', v_slots[v_step + 1],
    'champion', null,
    'skipped', true);
  v_next := public.match_draft_next_step(v_actions);

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = now()
  where id = v_row.id;
end $$;

-- A captain asks to redo one of their own locked or skipped steps.
create or replace function public.request_match_draft_change(
  p_fixture uuid,
  p_game int,
  p_step int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_caller_side text;
  v_row public.match_drafts;
  v_action jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found then
    raise exception 'BAD_REQUEST: no draft exists for that game';
  end if;
  if v_row.change_request is not null then
    raise exception 'REQUEST_PENDING: a change request is already waiting for an answer';
  end if;

  select a into v_action from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int = p_step;
  if v_action is null then
    raise exception 'BAD_REQUEST: that step has not been drafted yet';
  end if;

  if not v_admin then
    v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can request changes';
    end if;
    if v_caller_side <> v_action->>'side' then
      raise exception 'NOT_YOUR_SIDE: you can only request changes to your own picks and bans';
    end if;
  end if;

  update public.match_drafts
     set change_request = jsonb_build_object(
       'stepIndex', p_step,
       'side', v_action->>'side',
       'champion', v_action->>'champion',
       'requestedAt', now())
   where id = v_row.id;
end $$;

-- The opposing captain (or an admin) approves/denies; the requesting side
-- may also deny to withdraw its own request.
create or replace function public.respond_match_draft_change(
  p_fixture uuid,
  p_game int,
  p_approve boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_caller_side text;
  v_row public.match_drafts;
  v_step int;
  v_actions jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found or v_row.change_request is null then
    raise exception 'BAD_REQUEST: there is no pending change request';
  end if;

  if not v_admin then
    v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can respond';
    end if;
    -- The requester may withdraw (deny) but never approve their own request.
    if p_approve and v_caller_side = v_row.change_request->>'side' then
      raise exception 'NOT_YOUR_CALL: the other team has to approve this request';
    end if;
  end if;

  if not p_approve then
    update public.match_drafts set change_request = null where id = v_row.id;
    return;
  end if;

  v_step := (v_row.change_request->>'stepIndex')::int;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_step;

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(public.match_draft_next_step(v_actions), 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = now(),
    change_request = null
  where id = v_row.id;
end $$;

-- Admin-only single-step rollback (softer than the reset buttons).
create or replace function public.undo_match_draft_last(
  p_fixture uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.match_drafts;
  v_last int;
  v_actions jsonb;
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY: only admins can undo a draft step';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found then return; end if;

  select max((a->>'stepIndex')::int) into v_last from jsonb_array_elements(v_row.actions) a;
  if v_last is null then return; end if;

  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_last;

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(public.match_draft_next_step(v_actions), 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = now(),
    change_request = null
  where id = v_row.id;
end $$;

grant execute on function public.match_draft_next_step(jsonb) to anon, authenticated;
grant execute on function public.skip_match_draft_step(uuid, int) to authenticated;
grant execute on function public.request_match_draft_change(uuid, int, int) to authenticated;
grant execute on function public.respond_match_draft_change(uuid, int, boolean) to authenticated;
grant execute on function public.undo_match_draft_last(uuid, int) to authenticated;
