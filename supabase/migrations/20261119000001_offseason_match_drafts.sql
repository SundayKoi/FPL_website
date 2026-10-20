-- Offseason champion drafts (see docs/offseason.md): the league's pick/ban
-- drafter for the offseason tournament's matches. The two teams' captains
-- draft each game of a match; everyone else watches, and the finished drafts
-- show in the match's history.
--
-- The games live in their own table, keyed by offseason match, so league
-- readers of match_drafts (team pages, scouting, the broadcaster) never see
-- an offseason draft. The functions are the fixture drafter's
-- (20261002000001_match_draft_overtime.sql and the migrations before it) with
-- the caller resolved through the event instead of the league:
--   - a team's captain is its captain entrant, by the account that entry is
--     linked to (offseason_entrants.profile_id);
--   - offseason staff (offseason_is_staff) act for either side, undo and reset;
--   - a match has as many games as its best_of;
--   - the series is always fearless: a champion picked in an earlier game of
--     the match can't be picked again.
-- They keep the fixture drafter's names with "match_draft" swapped for
-- "offseason_draft", which is how the board reaches them. Clocks, overtime
-- and step order are the same, through the shared match_draft_* helpers.

create table public.offseason_match_drafts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.offseason_matches(id) on delete cascade,
  game_number int not null check (game_number between 1 and 5),
  status public.match_draft_status not null default 'drafting',
  current_step_index int not null default 0 check (current_step_index between 0 and 19),
  turn_started_at timestamptz,
  turn_deadline_at timestamptz,
  turn_allowance_seconds int,
  blue_pending_overtime_seconds int not null default 0 check (blue_pending_overtime_seconds >= 0),
  red_pending_overtime_seconds int not null default 0 check (red_pending_overtime_seconds >= 0),
  -- The sides' team names once someone chooses them; until then team A is blue.
  blue_team_name text,
  red_team_name text,
  blue_ready boolean not null default false,
  red_ready boolean not null default false,
  change_request jsonb,
  positions jsonb,
  -- The draft room's own tally of who won, by team name. The match's result
  -- is still offseason_games, from the ingest or staff.
  winner_team text,
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array'),
  -- Assigned by assign_match_draft_revision, so a snapshot never replaces newer state.
  revision bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, game_number)
);

create trigger touch_offseason_match_drafts_updated_at
  before update on public.offseason_match_drafts
  for each row execute function public.touch_match_draft_updated_at();

create trigger assign_offseason_match_draft_revision
  before insert or update on public.offseason_match_drafts
  for each row execute function public.assign_match_draft_revision();

-- Anyone can watch, live or afterwards. Every write goes through the functions below.
alter table public.offseason_match_drafts enable row level security;
create policy offseason_match_drafts_public_read on public.offseason_match_drafts for select using (true);
revoke all on public.offseason_match_drafts from anon, authenticated;
grant select on public.offseason_match_drafts to anon, authenticated;
grant all on public.offseason_match_drafts to service_role;

-- Realtime filters deletes by the old row, so it needs all of it.
alter table public.offseason_match_drafts replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.offseason_match_drafts;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to clients).

-- The LCS order, step by step (0-19): which side, ban or pick, and which slot.
-- Matches LCS_DRAFT_STEPS in src/lib/match-draft/rules.ts.
create function public._offseason_draft_side(p_step int) returns text
language sql immutable set search_path = public as $$
  select (array[
    'blue','red','blue','red','blue','red',
    'blue','red','red','blue','blue','red',
    'red','blue','red','blue',
    'red','blue','blue','red'])[p_step + 1]
$$;

create function public._offseason_draft_kind(p_step int) returns text
language sql immutable set search_path = public as $$
  select (array[
    'ban','ban','ban','ban','ban','ban',
    'pick','pick','pick','pick','pick','pick',
    'ban','ban','ban','ban',
    'pick','pick','pick','pick'])[p_step + 1]
$$;

create function public._offseason_draft_slot(p_step int) returns int
language sql immutable set search_path = public as $$
  select (array[1,1,2,2,3,3, 1,1,2,2,3,3, 4,4,5,5, 4,4,5,5])[p_step + 1]
$$;

-- The game's row, created if it has none yet and locked. Refuses a game the
-- match doesn't have.
create function public._offseason_draft_row(p_match uuid, p_game int) returns public.offseason_match_drafts
language plpgsql security definer set search_path = public as $$
declare
  v_best_of int;
  v_row public.offseason_match_drafts;
begin
  select best_of into v_best_of from public.offseason_matches where id = p_match;
  if not found then
    raise exception 'MATCH_NOT_FOUND: no such match';
  end if;
  if p_game is null or p_game < 1 or p_game > v_best_of then
    raise exception 'BAD_GAME: this match has % game(s)', v_best_of;
  end if;
  insert into public.offseason_match_drafts (match_id, game_number)
  values (p_match, p_game)
  on conflict (match_id, game_number) do nothing;
  select * into v_row from public.offseason_match_drafts
   where match_id = p_match and game_number = p_game
   for update;
  return v_row;
end $$;

-- Which side of the game the caller captains: 'blue', 'red', or null when
-- they captain neither team. The game's chosen sides when set, otherwise
-- team A on blue.
create function public._offseason_draft_caller_side(p_match uuid, p_game int) returns text
language sql stable security definer set search_path = public as $$
  select case
    when d.blue_team_name is null then case when t.id = m.team_a_id then 'blue' else 'red' end
    when lower(btrim(t.name)) = lower(btrim(d.blue_team_name)) then 'blue'
    when lower(btrim(t.name)) = lower(btrim(d.red_team_name)) then 'red'
  end
  from public.offseason_matches m
  join public.offseason_teams t on t.id in (m.team_a_id, m.team_b_id)
  join public.offseason_entrants e on e.id = t.captain_entrant_id
  left join public.offseason_match_drafts d on d.match_id = m.id and d.game_number = p_game
  where m.id = p_match and e.profile_id = auth.uid()
  limit 1
$$;

-- Writes a game's actions and opens its next empty step, or completes the
-- game. Reopening a step (an approved change, an undo) also clears what
-- depended on the old picks.
create function public._offseason_draft_advance(
  p_id uuid,
  p_actions jsonb,
  p_now timestamptz,
  p_blue_pending int,
  p_red_pending int,
  p_reopen boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_next int := public.match_draft_next_step(p_actions);
begin
  update public.offseason_match_drafts set
    actions = p_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = case when v_next is null then null else p_now end,
    turn_allowance_seconds = case when v_next is null then null else public.match_draft_turn_allowance_seconds(
      public._offseason_draft_kind(v_next), public._offseason_draft_side(v_next), p_blue_pending, p_red_pending) end,
    turn_deadline_at = case when v_next is null then null else public.match_draft_turn_deadline(
      p_now, public._offseason_draft_kind(v_next), public._offseason_draft_side(v_next), p_blue_pending, p_red_pending) end,
    blue_pending_overtime_seconds = p_blue_pending,
    red_pending_overtime_seconds = p_red_pending,
    change_request = case when p_reopen then null else change_request end,
    positions = case when p_reopen then null else positions end,
    winner_team = case when p_reopen then null else winner_team end
  where id = p_id;
end $$;

revoke all on function public._offseason_draft_side(int) from public, anon, authenticated;
revoke all on function public._offseason_draft_kind(int) from public, anon, authenticated;
revoke all on function public._offseason_draft_slot(int) from public, anon, authenticated;
revoke all on function public._offseason_draft_row(uuid, int) from public, anon, authenticated;
revoke all on function public._offseason_draft_caller_side(uuid, int) from public, anon, authenticated;
revoke all on function public._offseason_draft_advance(uuid, jsonb, timestamptz, int, int, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The drafter

create function public.apply_offseason_draft_action(
  p_match uuid,
  p_game int,
  p_step int,
  p_champion text,
  p_player_name text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
  v_side text;
  v_kind text;
  v_now timestamptz;
  v_deadline timestamptz;
  v_pending_before int;
  v_overtime int := 0;
  v_blue_pending int;
  v_red_pending int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain to draft';
  end if;
  if p_step is null or p_step < 0 or p_step > 19 or coalesce(btrim(p_champion), '') = '' then
    raise exception 'BAD_REQUEST: invalid draft action';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if v_row.status = 'complete' then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if coalesce(public.match_draft_next_step(v_row.actions), 20) <> p_step then
    raise exception 'OUT_OF_TURN: that step is not up';
  end if;
  if not (v_row.blue_ready and v_row.red_ready) then
    raise exception 'NOT_READY: both teams must ready up first';
  end if;

  v_side := public._offseason_draft_side(p_step);
  v_kind := public._offseason_draft_kind(p_step);
  if not public.offseason_is_staff() then
    v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can draft';
    end if;
    if v_caller_side <> v_side then
      raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_side;
    end if;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_row.actions) a
    where a->>'champion' is not null and lower(btrim(a->>'champion')) = lower(btrim(p_champion))
  ) then
    raise exception 'CHAMPION_TAKEN: % is already picked or banned this game', p_champion;
  end if;
  if exists (
    select 1
    from public.offseason_match_drafts d, jsonb_array_elements(d.actions) a
    where d.match_id = p_match
      and d.game_number < p_game
      and a->>'kind' = 'pick'
      and a->>'champion' is not null
      and lower(btrim(a->>'champion')) = lower(btrim(p_champion))
  ) then
    raise exception 'FEARLESS_BLOCKED: % was already picked earlier in this match', p_champion;
  end if;

  v_now := clock_timestamp();
  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_blue_pending := greatest(0, coalesce(v_row.blue_pending_overtime_seconds, 0));
  v_red_pending := greatest(0, coalesce(v_row.red_pending_overtime_seconds, 0));
  v_pending_before := case when v_side = 'blue' then v_blue_pending else v_red_pending end;
  if v_kind = 'pick' then
    v_overtime := public.match_draft_overtime_seconds(v_deadline, v_now);
    if v_side = 'blue' then v_blue_pending := v_overtime; else v_red_pending := v_overtime; end if;
  end if;

  perform public._offseason_draft_advance(
    v_row.id,
    v_row.actions || jsonb_build_object(
      'stepIndex', p_step,
      'side', v_side,
      'kind', v_kind,
      'slot', public._offseason_draft_slot(p_step),
      'champion', btrim(p_champion),
      'playerName', p_player_name,
      'overtimeSeconds', v_overtime,
      'pendingOvertimeBeforeSeconds', v_pending_before),
    v_now, v_blue_pending, v_red_pending);
end $$;

create function public.set_offseason_draft_ready(
  p_match uuid,
  p_game int,
  p_side text,
  p_ready boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
  v_blue_ready boolean;
  v_red_ready boolean;
  v_now timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;
  if p_side is null or p_side not in ('blue', 'red') or p_ready is null then
    raise exception 'BAD_REQUEST: invalid ready request';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if not public.offseason_is_staff() then
    v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can ready up';
    end if;
    if v_caller_side <> p_side then
      raise exception 'NOT_YOUR_SIDE: you can only ready your own team';
    end if;
  end if;
  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: the draft is already under way';
  end if;

  v_blue_ready := case when p_side = 'blue' then p_ready else v_row.blue_ready end;
  v_red_ready := case when p_side = 'red' then p_ready else v_row.red_ready end;
  if v_blue_ready and v_red_ready then v_now := clock_timestamp(); end if;

  update public.offseason_match_drafts set
    blue_ready = v_blue_ready,
    red_ready = v_red_ready,
    blue_pending_overtime_seconds = 0,
    red_pending_overtime_seconds = 0,
    turn_started_at = v_now,
    turn_allowance_seconds = case when v_now is null then null else 30 end,
    turn_deadline_at = v_now + interval '30 seconds'
  where id = v_row.id;
end $$;

create function public.choose_offseason_draft_blue(
  p_match uuid,
  p_game int,
  p_blue_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_team_a text;
  v_team_b text;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if not public.offseason_is_staff() and public._offseason_draft_caller_side(p_match, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can choose sides';
  end if;
  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: sides are locked once the draft begins';
  end if;

  select ta.name, tb.name into v_team_a, v_team_b
  from public.offseason_matches m
  join public.offseason_teams ta on ta.id = m.team_a_id
  join public.offseason_teams tb on tb.id = m.team_b_id
  where m.id = p_match;
  if lower(btrim(v_team_a)) = lower(btrim(v_team_b)) then
    raise exception 'SAME_NAMES: both teams have the same name, so sides can''t be told apart';
  end if;

  if lower(btrim(p_blue_name)) = lower(btrim(v_team_a)) then
    update public.offseason_match_drafts set blue_team_name = v_team_a, red_team_name = v_team_b where id = v_row.id;
  elsif lower(btrim(p_blue_name)) = lower(btrim(v_team_b)) then
    update public.offseason_match_drafts set blue_team_name = v_team_b, red_team_name = v_team_a where id = v_row.id;
  else
    raise exception 'BAD_REQUEST: % is not one of this match''s teams', p_blue_name;
  end if;
end $$;

-- Either captain's board calls this once a ban's clock has run out.
create function public.skip_offseason_draft_step(
  p_match uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_step int;
  v_now timestamptz;
  v_deadline timestamptz;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if not public.offseason_is_staff() and public._offseason_draft_caller_side(p_match, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can skip a turn';
  end if;
  if v_row.status = 'complete' or not (v_row.blue_ready and v_row.red_ready) then return; end if;

  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then return; end if;
  if public._offseason_draft_kind(v_step) <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_SKIPPED: picks stay selectable during overtime';
  end if;

  v_deadline := coalesce(v_row.turn_deadline_at, v_row.turn_started_at + interval '30 seconds');
  v_now := clock_timestamp();
  if v_deadline is null or v_now < v_deadline + interval '3 seconds' then
    raise exception 'TOO_SOON: the ban clock has not expired yet';
  end if;

  perform public._offseason_draft_advance(
    v_row.id,
    v_row.actions || jsonb_build_object(
      'stepIndex', v_step,
      'side', public._offseason_draft_side(v_step),
      'kind', 'ban',
      'slot', public._offseason_draft_slot(v_step),
      'champion', null,
      'skipped', true),
    v_now,
    greatest(0, v_row.blue_pending_overtime_seconds),
    greatest(0, v_row.red_pending_overtime_seconds));
end $$;

-- A captain gives up their own ban.
create function public.pass_offseason_draft_step(
  p_match uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
  v_step int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain to draft';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
  if not public.offseason_is_staff() and v_caller_side is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can pass a ban';
  end if;
  if v_row.status = 'complete' then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if not (v_row.blue_ready and v_row.red_ready) then
    raise exception 'NOT_READY: both teams must ready up first';
  end if;

  v_step := public.match_draft_next_step(v_row.actions);
  if v_step is null then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;
  if public._offseason_draft_kind(v_step) <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_PASSED: only a ban can be passed';
  end if;
  if not public.offseason_is_staff() and v_caller_side <> public._offseason_draft_side(v_step) then
    raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', public._offseason_draft_side(v_step);
  end if;

  perform public._offseason_draft_advance(
    v_row.id,
    v_row.actions || jsonb_build_object(
      'stepIndex', v_step,
      'side', public._offseason_draft_side(v_step),
      'kind', 'ban',
      'slot', public._offseason_draft_slot(v_step),
      'champion', null,
      'skipped', true),
    clock_timestamp(),
    greatest(0, v_row.blue_pending_overtime_seconds),
    greatest(0, v_row.red_pending_overtime_seconds));
end $$;

-- A captain asks to redo one of their own locked or skipped steps.
create function public.request_offseason_draft_change(
  p_match uuid,
  p_game int,
  p_step int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
  v_action jsonb;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if v_row.change_request is not null then
    raise exception 'REQUEST_PENDING: a change request is already waiting for an answer';
  end if;
  select a into v_action from jsonb_array_elements(v_row.actions) a where (a->>'stepIndex')::int = p_step;
  if v_action is null then
    raise exception 'BAD_REQUEST: that step has not been drafted yet';
  end if;
  if not public.offseason_is_staff() then
    v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can request changes';
    end if;
    if v_caller_side <> v_action->>'side' then
      raise exception 'NOT_YOUR_SIDE: you can only request changes to your own picks and bans';
    end if;
  end if;

  update public.offseason_match_drafts
     set change_request = jsonb_build_object(
       'stepIndex', p_step,
       'side', v_action->>'side',
       'champion', v_action->>'champion',
       'requestedAt', now())
   where id = v_row.id;
end $$;

-- The other captain (or staff) approves; either may deny, which withdraws it.
-- Approving reopens the step with the pick debt from before it.
create function public.respond_offseason_draft_change(
  p_match uuid,
  p_game int,
  p_approve boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
  v_step int;
  v_action jsonb;
  v_actions jsonb;
  v_blue_pending int;
  v_red_pending int;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if v_row.change_request is null then
    raise exception 'BAD_REQUEST: there is no pending change request';
  end if;
  if not public.offseason_is_staff() then
    v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can respond';
    end if;
    if p_approve and v_caller_side = v_row.change_request->>'side' then
      raise exception 'NOT_YOUR_CALL: the other team has to approve this request';
    end if;
  end if;

  if not coalesce(p_approve, false) then
    update public.offseason_match_drafts set change_request = null where id = v_row.id;
    return;
  end if;

  v_step := (v_row.change_request->>'stepIndex')::int;
  select a into v_action from jsonb_array_elements(v_row.actions) a where (a->>'stepIndex')::int = v_step;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a where (a->>'stepIndex')::int <> v_step;

  v_blue_pending := greatest(0, v_row.blue_pending_overtime_seconds);
  v_red_pending := greatest(0, v_row.red_pending_overtime_seconds);
  if v_action->>'kind' = 'pick' then
    if v_action->>'side' = 'blue' then
      v_blue_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    else
      v_red_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    end if;
  end if;

  perform public._offseason_draft_advance(v_row.id, v_actions, clock_timestamp(), v_blue_pending, v_red_pending, true);
end $$;

-- Staff take back the last locked step.
create function public.undo_offseason_draft_last(
  p_match uuid,
  p_game int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_last int;
  v_action jsonb;
  v_actions jsonb;
  v_blue_pending int;
  v_red_pending int;
begin
  if not public.offseason_is_staff() then
    raise exception 'STAFF_ONLY: only offseason staff can undo a draft step';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  select max((a->>'stepIndex')::int) into v_last from jsonb_array_elements(v_row.actions) a;
  if v_last is null then return; end if;
  select a into v_action from jsonb_array_elements(v_row.actions) a where (a->>'stepIndex')::int = v_last;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a where (a->>'stepIndex')::int <> v_last;

  v_blue_pending := greatest(0, v_row.blue_pending_overtime_seconds);
  v_red_pending := greatest(0, v_row.red_pending_overtime_seconds);
  if v_action->>'kind' = 'pick' then
    if v_action->>'side' = 'blue' then
      v_blue_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    else
      v_red_pending := greatest(0, coalesce((v_action->>'pendingOvertimeBeforeSeconds')::int, 0));
    end if;
  end if;

  perform public._offseason_draft_advance(v_row.id, v_actions, clock_timestamp(), v_blue_pending, v_red_pending, true);
end $$;

-- After the draft, each captain confirms which champion plays which role.
create function public.set_offseason_draft_positions(
  p_match uuid,
  p_game int,
  p_side text,
  p_champions jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_caller_side text;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;
  if p_side is null or p_side not in ('blue', 'red') then
    raise exception 'BAD_REQUEST: invalid side';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if not public.offseason_is_staff() then
    v_caller_side := public._offseason_draft_caller_side(p_match, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can confirm roles';
    end if;
    if v_caller_side <> p_side then
      raise exception 'NOT_YOUR_SIDE: you can only confirm your own team''s roles';
    end if;
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: roles are confirmed after the draft is finished';
  end if;
  if not public.draft_positions_valid(v_row.actions, p_side, p_champions) then
    raise exception 'BAD_POSITIONS: the champions do not match this side''s picks';
  end if;

  update public.offseason_match_drafts
     set positions = coalesce(positions, '{}'::jsonb) || jsonb_build_object(p_side, p_champions)
   where id = v_row.id;
end $$;

-- The draft room's tally: who won the game, by team name, or null to clear.
create function public.set_offseason_draft_winner(
  p_match uuid,
  p_game int,
  p_team text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row public.offseason_match_drafts;
  v_team text;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain';
  end if;

  v_row := public._offseason_draft_row(p_match, p_game);
  if not public.offseason_is_staff() and public._offseason_draft_caller_side(p_match, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can record a result';
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: finish the draft before recording a result';
  end if;

  if p_team is not null then
    select t.name into v_team
    from public.offseason_matches m
    join public.offseason_teams t on t.id in (m.team_a_id, m.team_b_id)
    where m.id = p_match and lower(btrim(t.name)) = lower(btrim(p_team))
    limit 1;
    if v_team is null then
      raise exception 'BAD_REQUEST: % is not one of this match''s teams', p_team;
    end if;
  end if;

  update public.offseason_match_drafts set winner_team = v_team where id = v_row.id;
end $$;

-- Staff start a game's draft, or the whole match's, over. An update rather
-- than a delete, so every viewer gets the reset as a row change.
create function public.reset_offseason_draft(
  p_match uuid,
  p_game int default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.offseason_is_staff() then
    raise exception 'STAFF_ONLY: only offseason staff can reset a draft';
  end if;
  update public.offseason_match_drafts
     set status = 'drafting'::public.match_draft_status,
         current_step_index = 0,
         turn_started_at = null,
         turn_deadline_at = null,
         turn_allowance_seconds = null,
         blue_pending_overtime_seconds = 0,
         red_pending_overtime_seconds = 0,
         blue_team_name = null,
         red_team_name = null,
         blue_ready = false,
         red_ready = false,
         change_request = null,
         positions = null,
         winner_team = null,
         actions = '[]'::jsonb
   where match_id = p_match
     and (p_game is null or game_number = p_game);
end $$;

revoke all on function public.apply_offseason_draft_action(uuid, int, int, text, text) from public, anon;
revoke all on function public.set_offseason_draft_ready(uuid, int, text, boolean) from public, anon;
revoke all on function public.choose_offseason_draft_blue(uuid, int, text) from public, anon;
revoke all on function public.skip_offseason_draft_step(uuid, int) from public, anon;
revoke all on function public.pass_offseason_draft_step(uuid, int) from public, anon;
revoke all on function public.request_offseason_draft_change(uuid, int, int) from public, anon;
revoke all on function public.respond_offseason_draft_change(uuid, int, boolean) from public, anon;
revoke all on function public.undo_offseason_draft_last(uuid, int) from public, anon;
revoke all on function public.set_offseason_draft_positions(uuid, int, text, jsonb) from public, anon;
revoke all on function public.set_offseason_draft_winner(uuid, int, text) from public, anon;
revoke all on function public.reset_offseason_draft(uuid, int) from public, anon;
grant execute on function public.apply_offseason_draft_action(uuid, int, int, text, text) to authenticated;
grant execute on function public.set_offseason_draft_ready(uuid, int, text, boolean) to authenticated;
grant execute on function public.choose_offseason_draft_blue(uuid, int, text) to authenticated;
grant execute on function public.skip_offseason_draft_step(uuid, int) to authenticated;
grant execute on function public.pass_offseason_draft_step(uuid, int) to authenticated;
grant execute on function public.request_offseason_draft_change(uuid, int, int) to authenticated;
grant execute on function public.respond_offseason_draft_change(uuid, int, boolean) to authenticated;
grant execute on function public.undo_offseason_draft_last(uuid, int) to authenticated;
grant execute on function public.set_offseason_draft_positions(uuid, int, text, jsonb) to authenticated;
grant execute on function public.set_offseason_draft_winner(uuid, int, text) to authenticated;
grant execute on function public.reset_offseason_draft(uuid, int) to authenticated;
