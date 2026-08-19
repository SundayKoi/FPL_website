-- Side enforcement for the match drafter: captains can only act for THEIR
-- side. Direct captain writes to match_drafts are revoked; every draft
-- mutation now goes through a security-definer RPC that validates the
-- caller's side, the turn order, the ready check, and champion legality.
-- Admins keep full control (testing/moderation), including direct writes.

-- Which side of a game the caller captains: 'blue', 'red', or null when they
-- captain neither team. Uses the game row's recorded side names when set
-- (sides can swap between games), otherwise the fixture's default order
-- (team_a = blue).
create or replace function public.match_draft_caller_side(p_fixture_id uuid, p_game int)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when lower(trim(lt.name)) = lower(trim(coalesce(d.blue_team_name, f.team_a))) then 'blue'
    when lower(trim(lt.name)) = lower(trim(coalesce(d.red_team_name, f.team_b))) then 'red'
  end
  from public.fixtures f
  left join public.match_drafts d
    on d.fixture_id = f.id and d.game_number = p_game
  join public.league_teams lt
    on lower(trim(lt.name)) in (lower(trim(f.team_a)), lower(trim(f.team_b)))
  join public.league_team_captains ltc
    on ltc.league_team_id = lt.id
   and ltc.season = f.season
  where f.id = p_fixture_id
    and ltc.profile_id = auth.uid()
  limit 1
$$;

-- One pick/ban, validated end to end. The 20-step LCS order lives here as
-- three parallel arrays (1-indexed) and MUST match src/lib/match-draft/
-- rules.ts's LCS_DRAFT_STEPS.
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
  if coalesce(v_row.current_step_index, 0) <> p_step then
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
    where lower(trim(a->>'champion')) = lower(trim(p_champion))
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
      and lower(trim(a->>'champion')) = lower(trim(p_champion))
  ) then
    raise exception 'FEARLESS_BLOCKED: % was already picked earlier in this series', p_champion;
  end if;

  update public.match_drafts set
    actions = actions || jsonb_build_object(
      'stepIndex', p_step,
      'side', v_step_side,
      'kind', v_kinds[p_step + 1],
      'slot', v_slots[p_step + 1],
      'champion', trim(p_champion),
      'playerName', p_player_name),
    current_step_index = least(p_step + 1, 19),
    status = case when p_step >= 19 then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = now()
  where id = v_row.id;
end $$;

-- Ready check: a captain can only ready/unready their OWN side.
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

  update public.match_drafts set
    blue_ready = case when p_side = 'blue' then p_ready else blue_ready end,
    red_ready = case when p_side = 'red' then p_ready else red_ready end,
    turn_started_at = case
      when (case when p_side = 'blue' then p_ready else blue_ready end)
       and (case when p_side = 'red' then p_ready else red_ready end)
      then now() else turn_started_at end
  where id = v_row.id;
end $$;

-- Side choice before game 2+: either of the match's captains (or an admin)
-- may set which team takes blue, but only before any action is locked.
create or replace function public.choose_match_draft_blue(
  p_fixture uuid,
  p_game int,
  p_blue_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_admin();
  v_team_a text;
  v_team_b text;
  v_red text;
  v_row public.match_drafts;
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN: sign in as a captain or admin';
  end if;
  if not v_admin and public.match_draft_caller_side(p_fixture, p_game) is null then
    raise exception 'NOT_A_CAPTAIN: only this match''s captains can choose sides';
  end if;

  select team_a, team_b into v_team_a, v_team_b from public.fixtures where id = p_fixture;
  if v_team_a is null or v_team_b is null then
    raise exception 'BAD_REQUEST: this fixture has no teams yet';
  end if;
  if lower(trim(p_blue_name)) = lower(trim(v_team_a)) then
    v_red := v_team_b;
  elsif lower(trim(p_blue_name)) = lower(trim(v_team_b)) then
    v_red := v_team_a;
  else
    raise exception 'BAD_REQUEST: % is not one of this fixture''s teams', p_blue_name;
  end if;

  insert into public.match_drafts (fixture_id, game_number)
  values (p_fixture, p_game)
  on conflict (fixture_id, game_number) do nothing;

  select * into v_row from public.match_drafts
   where fixture_id = p_fixture and game_number = p_game
   for update;
  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: sides are locked once the draft begins';
  end if;

  update public.match_drafts
     set blue_team_name = p_blue_name, red_team_name = v_red
   where id = v_row.id;
end $$;

grant execute on function public.match_draft_caller_side(uuid, int) to authenticated;
grant execute on function public.apply_match_draft_action(uuid, int, int, text, text) to authenticated;
grant execute on function public.set_match_draft_ready(uuid, int, text, boolean) to authenticated;
grant execute on function public.choose_match_draft_blue(uuid, int, text) to authenticated;

-- Captains lose direct table writes — the RPCs above are now their only
-- path, so side/turn checks cannot be bypassed via REST. Admins keep
-- direct writes (reset tooling).
drop policy if exists match_drafts_captain_insert on public.match_drafts;
create policy match_drafts_captain_insert on public.match_drafts
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists match_drafts_captain_update on public.match_drafts;
create policy match_drafts_captain_update on public.match_drafts
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists match_drafts_captain_delete on public.match_drafts;
create policy match_drafts_captain_delete on public.match_drafts
  for delete to authenticated
  using (public.is_admin());
