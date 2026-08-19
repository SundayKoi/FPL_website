-- Public lobby drafter (/drafter): anyone can create a draft lobby with no
-- account. Access is via three secret links — blue captain, red captain, and
-- spectator — drafterlol-style. The lobby row (which holds the tokens) is
-- unreadable directly; everything goes through token-checked RPCs that mirror
-- the match-draft validation (turn order, ready check, side enforcement,
-- champion legality, fearless, skips, change requests).

create table if not exists public.open_draft_lobbies (
  id uuid primary key default gen_random_uuid(),
  team_a_name text not null,
  team_b_name text not null,
  best_of int not null default 3 check (best_of in (1, 3, 5)),
  fearless boolean not null default true,
  token_a text not null unique,
  token_b text not null unique,
  token_spectator text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.open_drafts (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.open_draft_lobbies(id) on delete cascade,
  game_number int not null check (game_number between 1 and 5),
  status public.match_draft_status not null default 'drafting',
  current_step_index int not null default 0 check (current_step_index between 0 and 19),
  turn_started_at timestamptz,
  blue_team_name text,
  red_team_name text,
  blue_ready boolean not null default false,
  red_ready boolean not null default false,
  change_request jsonb,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lobby_id, game_number),
  check (jsonb_typeof(actions) = 'array')
);

create index if not exists open_drafts_lobby_idx
  on public.open_drafts (lobby_id, game_number);

drop trigger if exists touch_open_drafts_updated_at on public.open_drafts;
create trigger touch_open_drafts_updated_at
  before update on public.open_drafts
  for each row execute function public.touch_match_draft_updated_at();

-- Lobbies hold the secret tokens: no direct reads or writes for anyone.
alter table public.open_draft_lobbies enable row level security;
revoke all on public.open_draft_lobbies from anon, authenticated;
grant all on public.open_draft_lobbies to service_role;

-- Game rows are safe to read (that's the spectator view and what realtime
-- streams); all writes go through the RPCs below.
alter table public.open_drafts enable row level security;
drop policy if exists open_drafts_public_read on public.open_drafts;
create policy open_drafts_public_read on public.open_drafts
  for select using (true);
revoke all on public.open_drafts from anon, authenticated;
grant select on public.open_drafts to anon, authenticated;
grant all on public.open_drafts to service_role;

do $$ begin
  alter publication supabase_realtime add table public.open_drafts;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not granted to clients).

-- The lobby a token belongs to, or null. Internal — the row includes all
-- three tokens, so it must never be exposed directly.
create or replace function public.open_draft_lobby_for_token(p_token text)
returns public.open_draft_lobbies
language sql stable security definer set search_path = public as $$
  select l.*
  from public.open_draft_lobbies l
  where coalesce(trim(p_token), '') <> ''
    and (l.token_a = p_token or l.token_b = p_token or l.token_spectator = p_token)
  limit 1
$$;
revoke all on function public.open_draft_lobby_for_token(text) from public, anon, authenticated;

-- Which side a team occupies in one lobby game: recorded side names when the
-- game row has them (sides can swap between games), else team A = blue.
create or replace function public.open_draft_side_of(p_lobby uuid, p_game int, p_team text)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when lower(trim(p_team)) = lower(trim(coalesce(d.blue_team_name, l.team_a_name))) then 'blue'
    when lower(trim(p_team)) = lower(trim(coalesce(d.red_team_name, l.team_b_name))) then 'red'
  end
  from public.open_draft_lobbies l
  left join public.open_drafts d
    on d.lobby_id = l.id and d.game_number = p_game
  where l.id = p_lobby
$$;
revoke all on function public.open_draft_side_of(uuid, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public RPCs.

-- Create a lobby and hand back the three secret links' tokens. Opportunistic
-- housekeeping: lobbies older than 14 days are deleted, and creation is
-- capped at 30 lobbies an hour site-wide to keep abuse boring.
create or replace function public.create_open_draft_lobby(
  p_team_a text,
  p_team_b text,
  p_best_of int default 3,
  p_fearless boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_team_a text := trim(coalesce(p_team_a, ''));
  v_team_b text := trim(coalesce(p_team_b, ''));
  v_lobby public.open_draft_lobbies;
begin
  if v_team_a = '' or v_team_b = '' then
    raise exception 'BAD_REQUEST: both team names are required';
  end if;
  if length(v_team_a) > 40 or length(v_team_b) > 40 then
    raise exception 'BAD_REQUEST: team names are capped at 40 characters';
  end if;
  if lower(v_team_a) = lower(v_team_b) then
    raise exception 'BAD_REQUEST: the two teams need different names';
  end if;
  if p_best_of not in (1, 3, 5) then
    raise exception 'BAD_REQUEST: best of must be 1, 3, or 5';
  end if;

  delete from public.open_draft_lobbies
   where created_at < now() - interval '14 days';

  if (select count(*) from public.open_draft_lobbies
       where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'RATE_LIMITED: too many lobbies were created recently — try again in a bit';
  end if;

  insert into public.open_draft_lobbies (team_a_name, team_b_name, best_of, fearless, token_a, token_b, token_spectator)
  values (
    v_team_a,
    v_team_b,
    p_best_of,
    coalesce(p_fearless, true),
    replace(gen_random_uuid()::text, '-', ''),
    replace(gen_random_uuid()::text, '-', ''),
    replace(gen_random_uuid()::text, '-', ''))
  returning * into v_lobby;

  return jsonb_build_object(
    'lobbyId', v_lobby.id,
    'tokenA', v_lobby.token_a,
    'tokenB', v_lobby.token_b,
    'tokenSpectator', v_lobby.token_spectator);
end $$;

-- What one token unlocks: the lobby's public shape plus the caller's role.
-- Never returns the other links' tokens.
create or replace function public.open_draft_lobby_info(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
begin
  v_lobby := public.open_draft_lobby_for_token(p_token);
  if v_lobby.id is null then return null; end if;
  return jsonb_build_object(
    'lobbyId', v_lobby.id,
    'teamA', v_lobby.team_a_name,
    'teamB', v_lobby.team_b_name,
    'bestOf', v_lobby.best_of,
    'fearless', v_lobby.fearless,
    'createdAt', v_lobby.created_at,
    'teamName', case
      when v_lobby.token_a = p_token then v_lobby.team_a_name
      when v_lobby.token_b = p_token then v_lobby.team_b_name
    end);
end $$;

-- Resolve a captain token to its lobby, raising the shared errors — the
-- guts of every captain-gated RPC below. Guarantees the token is one of the
-- two captain tokens, so callers may derive the team with a simple CASE.
-- (Returns just the lobby row: plpgsql forbids composite variables in a
-- multi-item INTO list, so a (lobby, team) pair can't come back in one go.)
create or replace function public.open_draft_captain_lobby(p_token text, p_game int)
returns public.open_draft_lobbies
language plpgsql stable security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
begin
  v_lobby := public.open_draft_lobby_for_token(p_token);
  if v_lobby.id is null then
    raise exception 'BAD_LINK: this draft link is invalid or the lobby has expired';
  end if;
  if p_game < 1 or p_game > v_lobby.best_of then
    raise exception 'BAD_REQUEST: this lobby is a best of %', v_lobby.best_of;
  end if;
  if p_token not in (v_lobby.token_a, v_lobby.token_b) then
    raise exception 'SPECTATOR_LINK: this link can only watch — ask for a captain link to draft';
  end if;
  return v_lobby;
end $$;
revoke all on function public.open_draft_captain_lobby(text, int) from public, anon, authenticated;

-- One pick/ban in a lobby, validated end to end. Mirrors
-- apply_match_draft_action; the step arrays MUST match
-- src/lib/match-draft/rules.ts's LCS_DRAFT_STEPS.
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

  v_actions := v_row.actions || jsonb_build_object(
    'stepIndex', p_step,
    'side', v_side,
    'kind', v_kinds[p_step + 1],
    'slot', v_slots[p_step + 1],
    'champion', trim(p_champion),
    'playerName', p_player_name);
  v_next := public.match_draft_next_step(v_actions);

  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = now()
  where id = v_row.id;
end $$;

-- Ready check: a captain link can only ready/unready its OWN side.
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

  update public.open_drafts set
    blue_ready = case when p_side = 'blue' then p_ready else blue_ready end,
    red_ready = case when p_side = 'red' then p_ready else red_ready end,
    turn_started_at = case
      when (case when p_side = 'blue' then p_ready else blue_ready end)
       and (case when p_side = 'red' then p_ready else red_ready end)
      then now() else turn_started_at end
  where id = v_row.id;
end $$;

-- Side choice before game 2+: either captain link may set which team takes
-- blue, but only before any action is locked.
create or replace function public.choose_open_draft_blue(
  p_token text,
  p_game int,
  p_blue_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_red text;
  v_row public.open_drafts;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;
  if lower(trim(p_blue_name)) = lower(trim(v_lobby.team_a_name)) then
    v_red := v_lobby.team_b_name;
  elsif lower(trim(p_blue_name)) = lower(trim(v_lobby.team_b_name)) then
    v_red := v_lobby.team_a_name;
  else
    raise exception 'BAD_REQUEST: % is not one of this lobby''s teams', p_blue_name;
  end if;

  insert into public.open_drafts (lobby_id, game_number)
  values (v_lobby.id, p_game)
  on conflict (lobby_id, game_number) do nothing;

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
   for update;
  if jsonb_array_length(v_row.actions) > 0 then
    raise exception 'DRAFT_STARTED: sides are locked once the draft begins';
  end if;

  update public.open_drafts
     set blue_team_name = p_blue_name, red_team_name = v_red
   where id = v_row.id;
end $$;

-- Expired turn: either captain link can skip the current step once the 30s
-- clock plus a 3s grace has truly passed (server-checked).
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
  v_team text;
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

  update public.open_drafts set
    actions = v_actions,
    current_step_index = coalesce(v_next, 19),
    status = case when v_next is null then 'complete' else 'drafting' end::public.match_draft_status,
    turn_started_at = now()
  where id = v_row.id;
end $$;

-- A captain link asks to redo one of its own locked or skipped steps.
create or replace function public.request_open_draft_change(
  p_token text,
  p_game int,
  p_step int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
  v_team text;
  v_row public.open_drafts;
  v_action jsonb;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, p_game);
  v_team := case when v_lobby.token_a = p_token then v_lobby.team_a_name else v_lobby.team_b_name end;

  select * into v_row from public.open_drafts
   where lobby_id = v_lobby.id and game_number = p_game
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
  if public.open_draft_side_of(v_lobby.id, p_game, v_team) <> v_action->>'side' then
    raise exception 'NOT_YOUR_SIDE: you can only request changes to your own picks and bans';
  end if;

  update public.open_drafts
     set change_request = jsonb_build_object(
       'stepIndex', p_step,
       'side', v_action->>'side',
       'champion', v_action->>'champion',
       'requestedAt', now())
   where id = v_row.id;
end $$;

-- The opposing captain approves/denies; the requesting side may also deny to
-- withdraw its own request.
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
    change_request = null
  where id = v_row.id;
end $$;

-- Reset one game (or, with p_game null, the whole series). Either captain
-- link may do this — public lobbies have no admin.
create or replace function public.reset_open_draft(
  p_token text,
  p_game int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lobby public.open_draft_lobbies;
begin
  v_lobby := public.open_draft_captain_lobby(p_token, coalesce(p_game, 1));
  delete from public.open_drafts
   where lobby_id = v_lobby.id
     and (p_game is null or game_number = p_game);
end $$;

grant execute on function public.create_open_draft_lobby(text, text, int, boolean) to anon, authenticated;
grant execute on function public.open_draft_lobby_info(text) to anon, authenticated;
grant execute on function public.apply_open_draft_action(text, int, int, text, text) to anon, authenticated;
grant execute on function public.set_open_draft_ready(text, int, text, boolean) to anon, authenticated;
grant execute on function public.choose_open_draft_blue(text, int, text) to anon, authenticated;
grant execute on function public.skip_open_draft_step(text, int) to anon, authenticated;
grant execute on function public.request_open_draft_change(text, int, int) to anon, authenticated;
grant execute on function public.respond_open_draft_change(text, int, boolean) to anon, authenticated;
grant execute on function public.reset_open_draft(text, int) to anon, authenticated;
