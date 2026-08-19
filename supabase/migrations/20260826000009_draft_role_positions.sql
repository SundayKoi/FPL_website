-- Role confirmation after a game's draft completes (drafterlol-style):
-- captains drafted champions in pick order, but people usually aren't
-- picking for themselves — once the draft is DONE, each side confirms which
-- champion goes to which role (top→support), and the board re-orders its
-- pick column to match. Stored per game as
--   positions = {"blue": [c1..c5], "red": [c1..c5]}   (null = unconfirmed;
-- array entries may be null where a pick was skipped).
-- Reopening a draft (approved change request, admin undo) clears the
-- confirmations, since the picks may change.

alter table public.match_drafts
  add column if not exists positions jsonb;
alter table public.open_drafts
  add column if not exists positions jsonb;

-- A proposed role order is valid when it is 5 entries of strings/nulls whose
-- non-null champions are exactly the side's picked champions.
create or replace function public.draft_positions_valid(p_actions jsonb, p_side text, p_champions jsonb)
returns boolean
language sql immutable as $$
  select jsonb_typeof(p_champions) = 'array'
     and jsonb_array_length(p_champions) = 5
     and not exists (
       select 1 from jsonb_array_elements(p_champions) x
       where jsonb_typeof(x) not in ('string', 'null')
     )
     and not exists (
       (select lower(trim(x #>> '{}')) from jsonb_array_elements(p_champions) x
         where jsonb_typeof(x) = 'string')
       except
       (select lower(trim(a->>'champion')) from jsonb_array_elements(p_actions) a
         where a->>'kind' = 'pick' and a->>'side' = p_side and a->>'champion' is not null)
     )
     and not exists (
       (select lower(trim(a->>'champion')) from jsonb_array_elements(p_actions) a
         where a->>'kind' = 'pick' and a->>'side' = p_side and a->>'champion' is not null)
       except
       (select lower(trim(x #>> '{}')) from jsonb_array_elements(p_champions) x
         where jsonb_typeof(x) = 'string')
     )
     and (select count(*) from jsonb_array_elements(p_champions) x
           where jsonb_typeof(x) = 'string')
       = (select count(*) from jsonb_array_elements(p_actions) a
           where a->>'kind' = 'pick' and a->>'side' = p_side and a->>'champion' is not null)
$$;
revoke all on function public.draft_positions_valid(jsonb, text, jsonb) from public, anon, authenticated;

-- League drafter: a captain confirms their OWN side's roles (admins any).
create or replace function public.set_match_draft_positions(
  p_fixture uuid,
  p_game int,
  p_side text,
  p_champions jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_caller_side text;
  v_row public.match_drafts;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;
  if p_side not in ('blue', 'red') then
    raise exception 'BAD_REQUEST: invalid side';
  end if;
  if not v_admin then
    v_caller_side := public.match_draft_caller_side(p_fixture, p_game);
    if v_caller_side is null then
      raise exception 'NOT_A_CAPTAIN: only this match''s captains can confirm roles';
    end if;
    if v_caller_side <> p_side then
      raise exception 'NOT_YOUR_SIDE: you can only confirm your own team''s roles';
    end if;
  end if;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if not found then
    raise exception 'BAD_REQUEST: no draft exists for that game';
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: roles are confirmed after the draft is finished';
  end if;
  if not public.draft_positions_valid(v_row.actions, p_side, p_champions) then
    raise exception 'BAD_POSITIONS: the champions do not match this side''s picks';
  end if;

  update public.match_drafts
     set positions = coalesce(positions, '{}'::jsonb) || jsonb_build_object(p_side, p_champions)
   where id = v_row.id;
end $$;

-- Public lobby twin: the token must be the captain of p_side's team.
create or replace function public.set_open_draft_positions(
  p_token text,
  p_game int,
  p_side text,
  p_champions jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_row public.open_drafts;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  if p_side not in ('blue', 'red') then
    raise exception 'BAD_REQUEST: invalid side';
  end if;
  if public.open_draft_side_of(v_lobby.id, p_game, v_team) <> p_side then
    raise exception 'NOT_YOUR_SIDE: you can only confirm your own team''s roles';
  end if;

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found then
    raise exception 'BAD_REQUEST: no draft exists for that game';
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: roles are confirmed after the draft is finished';
  end if;
  if not public.draft_positions_valid(v_row.actions, p_side, p_champions) then
    raise exception 'BAD_POSITIONS: the champions do not match this side''s picks';
  end if;

  update public.open_drafts
     set positions = coalesce(positions, '{}'::jsonb) || jsonb_build_object(p_side, p_champions)
   where id = v_row.id;
end $$;

grant execute on function public.set_match_draft_positions(uuid, int, text, jsonb) to authenticated;
grant execute on function public.set_open_draft_positions(text, int, text, jsonb) to anon, authenticated;

-- Reopening a draft invalidates confirmed roles: the approve path and the
-- admin undo now also clear positions. (Bodies otherwise identical to
-- 20260826000006/-000007.)
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
    positions = null
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
    positions = null
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
  v_actions jsonb;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found or v_row.change_request is null then
    raise exception 'BAD_REQUEST: there is no pending change request';
  end if;

  if p_approve
     and public.open_draft_side_of(v_lobby.id, p_game, v_team) = v_row.change_request->>'side' then
    raise exception 'NOT_YOUR_CALL: the other team has to approve this request';
  end if;

  if not p_approve then
    update public.open_drafts set change_request = null where id = v_row.id;
    return;
  end if;

  v_step := (v_row.change_request->>'stepIndex')::int;
  select coalesce(jsonb_agg(a), '[]'::jsonb) into v_actions
    from jsonb_array_elements(v_row.actions) a
   where (a->>'stepIndex')::int <> v_step;

  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(public.match_draft_next_step(v_actions), 19),
    status = 'drafting'::public.match_draft_status,
    turn_started_at = now(),
    change_request = null,
    positions = null
  where id = v_row.id;
end $$;
