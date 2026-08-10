create table public.league_settings (
  id int primary key check (id = 1),
  featured_draft_id uuid references public.drafts(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.league_settings enable row level security;

create policy league_settings_public_read
  on public.league_settings for select using (true);
create policy league_settings_admin_write
  on public.league_settings for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.league_settings to anon, authenticated;
grant insert, update, delete on public.league_settings to authenticated;
grant all on public.league_settings to service_role;

create function public.swap_roster_players(
  p_left_player_id uuid,
  p_right_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left public.players;
  v_right public.players;
  v_left_team_id uuid;
  v_right_team_id uuid;
  v_left_acquisition public.acquisition_type;
  v_right_acquisition public.acquisition_type;
begin
  perform public._require_admin();

  if p_left_player_id is null or p_right_player_id is null then
    raise exception 'PLAYER_NOT_FOUND: both players are required';
  end if;
  if p_left_player_id = p_right_player_id then
    raise exception 'SAME_PLAYER: choose two different players';
  end if;

  -- Lock in deterministic ID order so simultaneous admin swaps cannot deadlock.
  perform 1
  from public.players
  where id in (p_left_player_id, p_right_player_id)
  order by id
  for update;

  select * into v_left from public.players where id = p_left_player_id;
  select * into v_right from public.players where id = p_right_player_id;

  if v_left.id is null or v_right.id is null then
    raise exception 'PLAYER_NOT_FOUND: player not found';
  end if;
  if v_left.team_id is null or v_right.team_id is null then
    raise exception 'PLAYER_UNASSIGNED: both players must be rostered';
  end if;
  if v_left.draft_id <> v_right.draft_id then
    raise exception 'DRAFT_MISMATCH: players must share a draft';
  end if;
  if v_left.team_id = v_right.team_id then
    raise exception 'SAME_TEAM: players must be on different teams';
  end if;
  if v_left.role <> v_right.role then
    raise exception 'ROLE_MISMATCH: players must share a role';
  end if;
  if v_left.acquisition = 'captain' or v_right.acquisition = 'captain' then
    raise exception 'CAPTAIN_LOCKED: captains cannot be traded';
  end if;

  v_left_team_id := v_left.team_id;
  v_right_team_id := v_right.team_id;
  v_left_acquisition := v_left.acquisition;
  v_right_acquisition := v_right.acquisition;

  -- Clear both fields first so the existing one-player-per-role index and
  -- the players team/acquisition check constraint allow the swap staging step.
  update public.players
  set team_id = null, acquisition = null
  where id in (v_left.id, v_right.id);

  update public.players
  set team_id = v_right_team_id, acquisition = v_left_acquisition
  where id = v_left.id;
  update public.players
  set team_id = v_left_team_id, acquisition = v_right_acquisition
  where id = v_right.id;
end;
$$;

revoke all on function public.swap_roster_players(uuid, uuid) from public;
grant execute on function public.swap_roster_players(uuid, uuid) to authenticated, service_role;
