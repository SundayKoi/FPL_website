-- Series score tracking for FIXTURE drafts, mirroring the public-lobby
-- version (20260826000010): after a game's draft completes, either captain
-- (or an admin) marks who won. The captain page then prefills the report's
-- score from these, and the drafter shows the running series tally. Stored
-- as the winning TEAM's name (sides swap between games, teams don't).

alter table public.match_drafts
  add column if not exists winner_team text;

create or replace function public.set_match_draft_winner(
  p_fixture uuid,
  p_game int,
  p_team text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_team_a text;
  v_team_b text;
  v_row public.match_drafts;
  v_team text;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;
  if not v_admin and public.match_draft_caller_side(p_fixture, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can record a result';
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found then
    raise exception 'BAD_REQUEST: no draft exists for that game';
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: finish the draft before recording a result';
  end if;

  select team_a, team_b into v_team_a, v_team_b from public.fixtures where id = p_fixture;

  -- Null clears a mis-click; otherwise store the canonical team name.
  if p_team is not null then
    if lower(trim(p_team)) = lower(trim(coalesce(v_team_a, ''))) then
      v_team := v_team_a;
    elsif lower(trim(p_team)) = lower(trim(coalesce(v_team_b, ''))) then
      v_team := v_team_b;
    else
      raise exception 'BAD_REQUEST: % is not one of this fixture''s teams', p_team;
    end if;
  end if;

  update public.match_drafts set winner_team = v_team where id = v_row.id;
end $$;

grant execute on function public.set_match_draft_winner(uuid, int, text) to authenticated;

-- Reopening a draft invalidates its recorded result too (bodies otherwise
-- identical to 20260826000009's).
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
    change_request = null,
    positions = null,
    winner_team = null
  where id = v_row.id;
end $$;
