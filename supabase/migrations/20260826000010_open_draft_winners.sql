-- Series score tracking for public lobbies: after a game's draft completes,
-- either captain marks who won. The lobby header shows the running series
-- score and calls the series once a team reaches the majority. Stored as the
-- winning TEAM's name (sides swap between games, teams don't).

alter table public.open_drafts
  add column if not exists winner_team text;

create or replace function public.set_open_draft_winner(
  p_token text,
  p_game int,
  p_team text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_row public.open_drafts;
  v_team text;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if not found then
    raise exception 'BAD_REQUEST: no draft exists for that game';
  end if;
  if v_row.status <> 'complete' then
    raise exception 'DRAFT_RUNNING: finish the draft before recording a result';
  end if;

  -- Null clears a mis-click; otherwise store the canonical team name.
  if p_team is not null then
    if lower(trim(p_team)) = lower(trim(v_lobby.team_a_name)) then
      v_team := v_lobby.team_a_name;
    elsif lower(trim(p_team)) = lower(trim(v_lobby.team_b_name)) then
      v_team := v_lobby.team_b_name;
    else
      raise exception 'BAD_REQUEST: % is not one of this lobby''s teams', p_team;
    end if;
  end if;

  update public.open_drafts set winner_team = v_team where id = v_row.id;
end $$;

grant execute on function public.set_open_draft_winner(text, int, text) to anon, authenticated;

-- Reopening a draft invalidates its recorded result too (body otherwise
-- identical to 20260826000009).
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
    positions = null,
    winner_team = null
  where id = v_row.id;
end $$;
