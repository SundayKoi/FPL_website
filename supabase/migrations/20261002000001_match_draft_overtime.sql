-- Signed pick clocks with server-authoritative overtime.
--
-- A row keeps the current deadline and each side's pending pick debt.  The
-- debt is read when that side's next pick opens, so bans and the opponent's
-- turns do not consume it.  When a pick is committed, the locked row is the
-- only place that calculates overtime; FOR UPDATE makes retries and racing
-- submissions observe the already-advanced step and never charge twice.

alter table public.match_drafts
  add column if not exists turn_deadline_at timestamptz,
  add column if not exists turn_allowance_seconds int,
  add column if not exists blue_pending_overtime_seconds int not null default 0,
  add column if not exists red_pending_overtime_seconds int not null default 0;

alter table public.open_drafts
  add column if not exists turn_deadline_at timestamptz,
  add column if not exists turn_allowance_seconds int,
  add column if not exists blue_pending_overtime_seconds int not null default 0,
  add column if not exists red_pending_overtime_seconds int not null default 0;

do $$ begin
  alter table public.match_drafts
    add constraint match_drafts_blue_pending_overtime_nonnegative
    check (blue_pending_overtime_seconds >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.match_drafts
    add constraint match_drafts_red_pending_overtime_nonnegative
    check (red_pending_overtime_seconds >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.open_drafts
    add constraint open_drafts_blue_pending_overtime_nonnegative
    check (blue_pending_overtime_seconds >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.open_drafts
    add constraint open_drafts_red_pending_overtime_nonnegative
    check (red_pending_overtime_seconds >= 0);
exception when duplicate_object then null;
end $$;

-- Existing active rows had the original 30-second clock.  Backfill them once;
-- rows without a started turn remain in the ready-check state.
update public.match_drafts
   set turn_allowance_seconds = coalesce(turn_allowance_seconds, 30),
       turn_deadline_at = coalesce(turn_deadline_at, turn_started_at + interval '30 seconds')
 where turn_started_at is not null;

update public.open_drafts
   set turn_allowance_seconds = coalesce(turn_allowance_seconds, 30),
       turn_deadline_at = coalesce(turn_deadline_at, turn_started_at + interval '30 seconds')
 where turn_started_at is not null;

create or replace function public.match_draft_turn_allowance_seconds(
  p_kind text,
  p_side text,
  p_blue_pending int,
  p_red_pending int
) returns int
language sql immutable set search_path = public as $$
  select case
    when p_kind = 'pick' and lower(trim(coalesce(p_side, ''))) = 'blue'
      then 30 - greatest(0, coalesce(p_blue_pending, 0))
    when p_kind = 'pick' and lower(trim(coalesce(p_side, ''))) = 'red'
      then 30 - greatest(0, coalesce(p_red_pending, 0))
    else 30
  end
$$;

create or replace function public.match_draft_turn_deadline(
  p_started_at timestamptz,
  p_kind text,
  p_side text,
  p_blue_pending int,
  p_red_pending int
) returns timestamptz
language sql immutable set search_path = public as $$
  select case
    when p_started_at is null then null
    else p_started_at + (
      public.match_draft_turn_allowance_seconds(
        p_kind, p_side, p_blue_pending, p_red_pending
      ) * interval '1 second'
    )
  end
$$;

create or replace function public.match_draft_overtime_seconds(
  p_deadline_at timestamptz,
  p_now timestamptz
) returns int
language sql immutable set search_path = public as $$
  select case
    when p_deadline_at is null or p_now <= p_deadline_at then 0
    else floor(extract(epoch from (p_now - p_deadline_at)))::int
  end
$$;

revoke all on function public.match_draft_turn_allowance_seconds(text, text, int, int) from public, anon, authenticated;
revoke all on function public.match_draft_turn_deadline(timestamptz, text, text, int, int) from public, anon, authenticated;
revoke all on function public.match_draft_overtime_seconds(timestamptz, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixture drafts

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
  v_now timestamptz;
  v_deadline timestamptz;
  v_pending_before int;
  v_overtime int;
  v_blue_pending int;
  v_red_pending int;
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

  v_now := clock_timestamp();
  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  v_pending_before := case when v_step_side = 'blue' then v_blue_pending else v_red_pending end;
  v_overtime := case
    when v_kinds[p_step + 1] = 'pick' then public.match_draft_overtime_seconds(v_deadline, v_now)
    else 0
  end;

  if v_kinds[p_step + 1] = 'pick' then
    if v_step_side = 'blue' then v_blue_pending := v_overtime;
    else v_red_pending := v_overtime;
    end if;
  end if;

  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', p_step,
    'side', v_step_side,
    'kind', v_kinds[p_step + 1],
    'slot', v_slots[p_step + 1],
    'champion', trim(p_champion),
    'playerName', p_player_name,
    'overtimeSeconds', v_overtime,
    'pendingOvertimeBeforeSeconds', v_pending_before);
  v_next := public.match_draft_next_step(v_actions);

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    blue_pending_overtime_seconds = v_blue_pending,
    red_pending_overtime_seconds = v_red_pending
  where id = v_row.id;
end $$;

create or replace function public.set_match_draft_ready(
  p_fixture uuid,
  p_game int,
  p_side text,
  p_ready boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_caller_side text;
  v_row public.match_drafts;
  v_blue_ready boolean;
  v_red_ready boolean;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;
  if p_side not in ('blue', 'red') or p_game < 1 or p_game > 5 then
    raise exception 'BAD_REQUEST: invalid ready request';
  end if;
  if not v_admin then
    v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can ready up';
    end if;
    if v_caller_side <> p_side then
      raise exception 'NOT_YOUR_SIDE: you can only ready your own team';
    end if;
  end if;

  insert into public.match_drafts (fixture_id, game_number)
  values (p_fixture, p_game)
  on conflict (fixture_id, game_number) do nothing;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;

  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: the draft is already under way';
  end if;

  v_blue_ready := case when p_side = 'blue' then p_ready else v_row.blue_ready end;
  v_red_ready := case when p_side = 'red' then p_ready else v_row.red_ready end;
  if v_blue_ready and v_red_ready then v_now := clock_timestamp(); end if;

  update public.match_drafts set
    blue_ready = v_blue_ready,
    red_ready = v_red_ready,
    blue_pending_overtime_seconds = 0,
    red_pending_overtime_seconds = 0,
    turn_started_at = case when v_blue_ready and v_red_ready then v_now else null end,
    turn_allowance_seconds = case when v_blue_ready and v_red_ready then 30 else null end,
    turn_deadline_at = case when v_blue_ready and v_red_ready then v_now + interval '30 seconds' else null end
  where id = v_row.id;
end $$;

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
  v_now timestamptz;
  v_deadline timestamptz;
  v_blue_pending int;
  v_red_pending int;
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

  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then return; end if;
  if v_kinds[v_step + 1] <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_SKIPPED: picks stay selectable during overtime';
  end if;

  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_now := clock_timestamp();
  if v_deadline is null or v_now < v_deadline + interval '3 seconds' then
    raise exception 'TOO_SOON: the ban clock has not expired yet';
  end if;

  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
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
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end
  where id = v_row.id;
end $$;

create or replace function public.pass_match_draft_step(
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
  v_admin boolean;
  v_caller_side text;
  v_row public.match_drafts;
  v_step int;
  v_actions jsonb;
  v_next int;
  v_now timestamptz;
  v_blue_pending int;
  v_red_pending int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin to draft';
  end if;
  v_admin := public.is_admin();
  v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
  if not v_admin and v_caller_side is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can pass a ban';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found or v_row.status = 'complete' then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if not (v_row.blue_ready and v_row.red_ready) then
    raise exception 'NOT_READY: both teams must ready up first';
  end if;

  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if v_kinds[v_step + 1] <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_PASSED: only a ban can be passed';
  end if;
  if not v_admin and v_caller_side <> v_sides[v_step + 1] then
    raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_sides[v_step + 1];
  end if;

  v_now := clock_timestamp();
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
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
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end
  where id = v_row.id;
end $$;

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
  v_action jsonb;
  v_actions jsonb;
  v_now timestamptz;
  v_blue_pending int;
  v_red_pending int;
  v_restored_pending int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin to draft';
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
    if p_approve and v_caller_side = v_row.change_request->>'side' then
      raise exception 'NOT_YOUR_CALL: the other team has to approve this request';
    end if;
  end if;

  if not p_approve then
    update public.match_drafts set change_request = null where id = v_row.id;
    return;
  end if;

  v_step := (v_row.change_request->>'stepIndex')::int;
  select a into v_action from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int = v_step;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_step;

  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  -- Restore the debt that existed before the changed pick opened.  This
  -- rolls back its old charge exactly once; the replacement pick will write a
  -- new charge when it is locked.
  if v_action->>'kind' = 'pick' then
    v_restored_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    if v_action->>'side' = 'blue' then v_blue_pending := v_restored_pending;
    elsif v_action->>'side' = 'red' then v_red_pending := v_restored_pending;
    end if;
  end if;
  v_now := clock_timestamp();
  
  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(public.match_draft_next_step(v_actions), 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = v_now,
    turn_allowance_seconds = public.match_draft_turn_allowance_seconds(
      coalesce(v_action->>'kind', 'ban'), coalesce(v_action->>'side', v_row.change_request->>'side'),
      v_blue_pending, v_red_pending),
    turn_deadline_at = public.match_draft_turn_deadline(
      v_now, coalesce(v_action->>'kind', 'ban'), coalesce(v_action->>'side', v_row.change_request->>'side'),
      v_blue_pending, v_red_pending),
    blue_pending_overtime_seconds = v_blue_pending,
    red_pending_overtime_seconds = v_red_pending,
    change_request = null,
    positions = null,
    winner_team = null
  where id = v_row.id;
end $$;

create or replace function public.undo_match_draft_last(
  p_fixture uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.match_drafts;
  v_last int;
  v_action jsonb;
  v_actions jsonb;
  v_next int;
  v_now timestamptz;
  v_blue_pending int;
  v_red_pending int;
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
  select a into v_action from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int = v_last;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_last;
  v_next := public.match_draft_next_step(v_actions);
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  if v_action->>'kind' = 'pick' then
    if v_action->>'side' = 'blue' then v_blue_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    elsif v_action->>'side' = 'red' then v_red_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    end if;
  end if;
  v_now := clock_timestamp();

  update public.match_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = v_now,
    turn_allowance_seconds = public.match_draft_turn_allowance_seconds(
      case when v_next is null then 'ban' else (array[
        'ban','ban','ban','ban','ban','ban','pick','pick','pick','pick','pick','pick','ban','ban','ban','ban','pick','pick','pick','pick'
      ])[v_next + 1] end,
      case when v_next is null then 'blue' else (array[
        'blue','red','blue','red','blue','red','blue','red','red','blue','blue','red','red','blue','red','blue','red','blue','blue','red'
      ])[v_next + 1] end,
      v_blue_pending, v_red_pending),
    turn_deadline_at = public.match_draft_turn_deadline(
      v_now,
      case when v_next is null then 'ban' else (array[
        'ban','ban','ban','ban','ban','ban','pick','pick','pick','pick','pick','pick','ban','ban','ban','ban','pick','pick','pick','pick'
      ])[v_next + 1] end,
      case when v_next is null then 'blue' else (array[
        'blue','red','blue','red','blue','red','blue','red','red','blue','blue','red','red','blue','red','blue','red','blue','blue','red'
      ])[v_next + 1] end,
      v_blue_pending, v_red_pending),
    blue_pending_overtime_seconds = v_blue_pending,
    red_pending_overtime_seconds = v_red_pending,
    change_request = null,
    positions = null,
    winner_team = null
  where id = v_row.id;
end $$;

-- ---------------------------------------------------------------------------
-- Public token lobbies

create or replace function public.apply_open_draft_action(
  p_token text,
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
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_side text;
  v_row public.open_drafts;
  v_actions jsonb;
  v_next int;
  v_now timestamptz;
  v_deadline timestamptz;
  v_pending_before int;
  v_overtime int;
  v_blue_pending int;
  v_red_pending int;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  if p_step < 0 or p_step > 19 or coalesce(trim(p_champion), '') = '' then
    raise exception 'BAD_REQUEST: invalid draft action';
  end if;

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found then
    insert into public.open_drafts (lobby_id, game_number)
    values (v_lobby.id, p_game)
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

  v_side := public.open_draft_side_of(v_lobby.id, p_game, v_team);
  if v_side is null or v_side <> v_sides[p_step + 1] then
    raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_sides[p_step + 1];
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_row.actions) a
    where a->>'champion' is not null
      and lower(trim(a->>'champion')) = lower(trim(p_champion))
  ) then
    raise exception 'CHAMPION_TAKEN: % is already picked or banned this game', p_champion;
  end if;
  if v_lobby.fearless and exists (
    select 1
    from public.open_drafts d2, jsonb_array_elements(d2.actions) a
    where d2.lobby_id = v_lobby.id
      and d2.game_number < p_game
      and a->>'kind' = 'pick'
      and a->>'champion' is not null
      and lower(trim(a->>'champion')) = lower(trim(p_champion))
  ) then
    raise exception 'FEARLESS_BLOCKED: % was already picked earlier in this series', p_champion;
  end if;

  v_now := clock_timestamp();
  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  v_pending_before := case when v_side = 'blue' then v_blue_pending else v_red_pending end;
  v_overtime := case when v_kinds[p_step + 1] = 'pick'
    then public.match_draft_overtime_seconds(v_deadline, v_now) else 0 end;
  if v_kinds[p_step + 1] = 'pick' then
    if v_side = 'blue' then v_blue_pending := v_overtime;
    else v_red_pending := v_overtime;
    end if;
  end if;

  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', p_step,
    'side', v_side,
    'kind', v_kinds[p_step + 1],
    'slot', v_slots[p_step + 1],
    'champion', trim(p_champion),
    'playerName', p_player_name,
    'overtimeSeconds', v_overtime,
    'pendingOvertimeBeforeSeconds', v_pending_before);
  v_next := public.match_draft_next_step(v_actions);

  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    blue_pending_overtime_seconds = v_blue_pending,
    red_pending_overtime_seconds = v_red_pending
  where id = v_row.id;
end $$;

create or replace function public.set_open_draft_ready(
  p_token text,
  p_game int,
  p_side text,
  p_ready boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_row public.open_drafts;
  v_blue_ready boolean;
  v_red_ready boolean;
  v_now timestamptz;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  if p_side not in ('blue', 'red') then
    raise exception 'BAD_REQUEST: invalid ready request';
  end if;
  if public.open_draft_side_of(v_lobby.id, p_game, v_team) <> p_side then
    raise exception 'NOT_YOUR_SIDE: you can only ready your own team';
  end if;

  insert into public.open_drafts (lobby_id, game_number)
  values (v_lobby.id, p_game)
  on conflict (lobby_id, game_number) do nothing;
  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: the draft is already under way';
  end if;

  v_blue_ready := case when p_side = 'blue' then p_ready else v_row.blue_ready end;
  v_red_ready := case when p_side = 'red' then p_ready else v_row.red_ready end;
  if v_blue_ready and v_red_ready then v_now := clock_timestamp(); end if;
  update public.open_drafts set
    blue_ready = v_blue_ready,
    red_ready = v_red_ready,
    blue_pending_overtime_seconds = 0,
    red_pending_overtime_seconds = 0,
    turn_started_at = case when v_blue_ready and v_red_ready then v_now else null end,
    turn_allowance_seconds = case when v_blue_ready and v_red_ready then 30 else null end,
    turn_deadline_at = case when v_blue_ready and v_red_ready then v_now + interval '30 seconds' else null end
  where id = v_row.id;
end $$;

create or replace function public.skip_open_draft_step(
  p_token text,
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
  v_lobby public.open_draft_lobbies;
  v_row public.open_drafts;
  v_step int;
  v_actions jsonb;
  v_next int;
  v_now timestamptz;
  v_deadline timestamptz;
  v_blue_pending int;
  v_red_pending int;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found or v_row.status = 'complete' then return; end if;
  if not (v_row.blue_ready and v_row.red_ready) then return; end if;
  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then return; end if;
  if v_kinds[v_step + 1] <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_SKIPPED: picks stay selectable during overtime';
  end if;
  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_now := clock_timestamp();
  if v_deadline is null or v_now < v_deadline + interval '3 seconds' then
    raise exception 'TOO_SOON: the ban clock has not expired yet';
  end if;

  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', v_step,
    'side', v_sides[v_step + 1],
    'kind', v_kinds[v_step + 1],
    'slot', v_slots[v_step + 1],
    'champion', null,
    'skipped', true);
  v_next := public.match_draft_next_step(v_actions);
  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end
  where id = v_row.id;
end $$;

create or replace function public.pass_open_draft_step(
  p_token text,
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
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_side text;
  v_row public.open_drafts;
  v_step int;
  v_actions jsonb;
  v_next int;
  v_now timestamptz;
  v_blue_pending int;
  v_red_pending int;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found or v_row.status = 'complete' then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if not (v_row.blue_ready and v_row.red_ready) then
    raise exception 'NOT_READY: both teams must ready up first';
  end if;
  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then raise exception 'DRAFT_COMPLETE: this draft is finished'; end if;
  if v_kinds[v_step + 1] <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_PASSED: only a ban can be passed';
  end if;
  v_side := public.open_draft_side_of(v_lobby.id, p_game, v_team);
  if v_side is null or v_side <> v_sides[v_step + 1] then
    raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_sides[v_step + 1];
  end if;

  v_now := clock_timestamp();
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', v_step,
    'side', v_sides[v_step + 1],
    'kind', v_kinds[v_step + 1],
    'slot', v_slots[v_step + 1],
    'champion', null,
    'skipped', true);
  v_next := public.match_draft_next_step(v_actions);
  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = case when v_next is null then null else v_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      v_now, v_kinds[v_next + 1], v_sides[v_next + 1], v_blue_pending, v_red_pending) end
  where id = v_row.id;
end $$;

create or replace function public.respond_open_draft_change(
  p_token text,
  p_game int,
  p_approve boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_row public.open_drafts;
  v_step int;
  v_action jsonb;
  v_actions jsonb;
  v_now timestamptz;
  v_blue_pending int;
  v_red_pending int;
  v_restored_pending int;
  v_kind text;
  v_side text;
  v_kinds constant text[] := array[
    'ban','ban','ban','ban','ban','ban','pick','pick','pick','pick','pick','pick','ban','ban','ban','ban','pick','pick','pick','pick'];
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found or v_row.change_request is null then
    raise exception 'BAD_REQUEST: there is no pending change request';
  end if;
  if p_approve and public.open_draft_side_of(v_lobby.id, p_game, v_team) = v_row.change_request->>'side' then
    raise exception 'NOT_YOUR_CALL: the other team has to approve this request';
  end if;
  if not p_approve then
    update public.open_drafts set change_request = null where id = v_row.id;
    return;
  end if;

  v_step := (v_row.change_request->>'stepIndex')::int;
  v_side := v_row.change_request->>'side';
  v_kind := case when v_step between 0 and 19 then v_kinds[v_step + 1] else 'ban' end;
  select a into v_action from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int = v_step;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_step;
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  if v_action->>'kind' = 'pick' then
    v_restored_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    if v_action->>'side' = 'blue' then v_blue_pending := v_restored_pending;
    elsif v_action->>'side' = 'red' then v_red_pending := v_restored_pending;
    end if;
  end if;
  v_now := clock_timestamp();
  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(public.match_draft_next_step(v_actions), 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = v_now,
    turn_allowance_seconds = public.match_draft_turn_allowance_seconds(v_kind, v_side, v_blue_pending, v_red_pending),
    turn_deadline_at = public.match_draft_turn_deadline(v_now, v_kind, v_side, v_blue_pending, v_red_pending),
    blue_pending_overtime_seconds = v_blue_pending,
    red_pending_overtime_seconds = v_red_pending,
    change_request = null,
    positions = null,
    winner_team = null
  where id = v_row.id;
end $$;

-- Fixture transitions must never be callable through the anonymous REST role;
-- the SECURITY DEFINER body is guarded by auth.uid()/captain checks.
revoke all on function public.apply_match_draft_action(uuid, int, int, text, text) from public, anon;
revoke all on function public.set_match_draft_ready(uuid, int, text, boolean) from public, anon;
revoke all on function public.skip_match_draft_step(uuid, int) from public, anon;
revoke all on function public.pass_match_draft_step(uuid, int) from public, anon;
revoke all on function public.respond_match_draft_change(uuid, int, boolean) from public, anon;
revoke all on function public.undo_match_draft_last(uuid, int) from public, anon;
grant execute on function public.apply_match_draft_action(uuid, int, int, text, text) to authenticated;
grant execute on function public.set_match_draft_ready(uuid, int, text, boolean) to authenticated;
grant execute on function public.skip_match_draft_step(uuid, int) to authenticated;
grant execute on function public.pass_match_draft_step(uuid, int) to authenticated;
grant execute on function public.respond_match_draft_change(uuid, int, boolean) to authenticated;
grant execute on function public.undo_match_draft_last(uuid, int) to authenticated;
grant execute on function public.apply_open_draft_action(text, int, int, text, text) to anon, authenticated;
grant execute on function public.set_open_draft_ready(text, int, text, boolean) to anon, authenticated;
grant execute on function public.skip_open_draft_step(text, int) to anon, authenticated;
grant execute on function public.pass_open_draft_step(text, int) to anon, authenticated;
grant execute on function public.respond_open_draft_change(text, int, boolean) to anon, authenticated;
