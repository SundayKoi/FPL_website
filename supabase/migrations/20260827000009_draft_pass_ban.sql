-- Passing a ban on purpose.
--
-- A team that loses a ban — a sub who never got one, a penalty, a house
-- rule — has had no way to say so. skip_match_draft_step exists, but it is
-- the TIMEOUT path: it refuses until the turn clock has run out
-- ("TOO_SOON"), because its job is to unstick a draft nobody is driving.
-- Making a team sit through 33 seconds of dead air to decline a ban is the
-- wrong shape for a decision somebody has already made.
--
-- So this is a separate verb rather than a loosened guard. The timeout
-- keeps its guard, which is what stops one captain skipping the other's
-- turn the moment it opens; passing is only ever the acting side's own
-- choice.
--
-- Three rules, all enforced here rather than in the UI:
--
--  1. Only the side whose turn it is may pass it. An admin may pass on
--     either side, since an admin already runs the draft.
--  2. BANS ONLY. A passed pick is a team playing four against five, which
--     is not a thing anyone means to click, and the confirm dialog is not
--     the place to catch it.
--  3. Both teams must be ready and the draft unfinished, exactly as every
--     other action requires.
--
-- The recorded action is byte-for-byte what a timeout writes — champion
-- null, skipped true — so the board, the change-request flow and the
-- summary all already render it. Nothing downstream has to learn a third
-- state, and a passed ban can be redone through the normal change request
-- like any other step.

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
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
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

-- The public-lobby twin. Same rules; identity comes from the captain token
-- instead of auth.uid(), exactly as apply_open_draft_action does it. No
-- admin bypass here — a lobby has no admins, only its two captain links.
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
  if v_step is null then
    raise exception 'DRAFT_COMPLETE: this draft is finished';
  end if;

  if v_kinds[v_step + 1] <> 'ban' then
    raise exception 'PICKS_CANNOT_BE_PASSED: only a ban can be passed';
  end if;

  v_side := public.open_draft_side_of(v_lobby.id, p_game, v_team);
  if v_side is null or v_side <> v_sides[v_step + 1] then
    raise exception 'NOT_YOUR_SIDE: it is the % side''s turn', v_sides[v_step + 1];
  end if;

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
    turn_started_at = now()
  where id = v_row.id;
end $$;

revoke all on function public.pass_match_draft_step(uuid, int) from public, anon;
grant execute on function public.pass_match_draft_step(uuid, int) to authenticated;
grant execute on function public.pass_open_draft_step(text, int) to anon, authenticated;
