-- Optional player names for public draft lobbies. The create form can take
-- up to five names per team (top→support order); pick slots show them when
-- present and just the champion when not.

alter table public.open_draft_lobbies
  add column if not exists team_a_players jsonb not null default '[]'::jsonb,
  add column if not exists team_b_players jsonb not null default '[]'::jsonb;

-- Sanitize a caller-supplied name list: strings only, trimmed, non-empty,
-- capped at 30 chars each and 5 names total. Anything malformed becomes [].
create or replace function public.open_draft_clean_players(p_players jsonb)
returns jsonb
language sql immutable as $$
  select case
    when p_players is null or jsonb_typeof(p_players) <> 'array' then '[]'::jsonb
    else coalesce((
      select jsonb_agg(name)
      from (
        select left(trim(v #>> '{}'), 30) as name
        from jsonb_array_elements(p_players) v
        where jsonb_typeof(v) = 'string' and trim(v #>> '{}') <> ''
        limit 5
      ) cleaned
    ), '[]'::jsonb)
  end
$$;
revoke all on function public.open_draft_clean_players(jsonb) from public, anon, authenticated;

-- Recreated with the two optional player lists. The old four-arg version is
-- dropped so PostgREST doesn't see an ambiguous overload.
drop function if exists public.create_open_draft_lobby(text, text, int, boolean);

create or replace function public.create_open_draft_lobby(
  p_team_a text,
  p_team_b text,
  p_best_of int default 3,
  p_fearless boolean default true,
  p_players_a jsonb default '[]'::jsonb,
  p_players_b jsonb default '[]'::jsonb
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

  insert into public.open_draft_lobbies (
    team_a_name, team_b_name, best_of, fearless,
    team_a_players, team_b_players,
    token_a, token_b, token_spectator)
  values (
    v_team_a,
    v_team_b,
    p_best_of,
    coalesce(p_fearless, true),
    public.open_draft_clean_players(p_players_a),
    public.open_draft_clean_players(p_players_b),
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

-- Info now carries the player lists too.
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
    'teamAPlayers', v_lobby.team_a_players,
    'teamBPlayers', v_lobby.team_b_players,
    'teamName', case
      when v_lobby.token_a = p_token then v_lobby.team_a_name
      when v_lobby.token_b = p_token then v_lobby.team_b_name
    end);
end $$;

grant execute on function public.create_open_draft_lobby(text, text, int, boolean, jsonb, jsonb) to anon, authenticated;
grant execute on function public.open_draft_lobby_info(text) to anon, authenticated;
