-- Three SECURITY DEFINER RPCs were still guarded by _require_admin(), so a
-- plain admin could call them from the browser console and bypass the
-- owner-only policies added earlier on 2026-08-23:
--
--   * seed_academy_regular_season() inserts/updates/deletes public.fixtures,
--     bypassing the owner-only fixtures policy from 20260823000011.
--   * admin_assign_setup_player(...) and admin_reorder_setup_teams(...)
--     write public.players and public.teams -- including points_remaining,
--     the draft economics gated owner-only by 20260823000009.
--
-- Re-guard all three with an inline owner check. There is deliberately no
-- _require_owner() helper (see 20260823000006/07/08/09/10/11), so the check
-- is repeated inline here, matching the RAISE shape of _require_admin().
--
-- swap_roster_players is NOT touched here: staying admin-callable there is a
-- deliberate, recorded decision.

create or replace function public.seed_academy_regular_season() returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: owner access required';
  end if;
  return public._seed_academy_regular_season();
end;
$$;

revoke all on function public.seed_academy_regular_season() from public;
grant execute on function public.seed_academy_regular_season() to authenticated, service_role;

create or replace function public.admin_assign_setup_player(
  p_draft_id uuid,
  p_player_id uuid,
  p_team_id uuid,
  p_price int,
  p_acquisition text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_player public.players;
  v_team public.teams;
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: owner access required';
  end if;
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'PRICE_INVALID: price must be a nonnegative integer';
  end if;

  select * into v_player from public.players
    where id = p_player_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'PLAYER_INVALID: player is not in this draft';
  end if;
  if v_player.team_id is not null then
    raise exception 'PLAYER_TAKEN: player is already assigned';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  if (select count(*) from public.players where team_id = v_team.id) >= 2 then
    raise exception 'SETUP_FULL: team already has two pre-filled players';
  end if;
  if not (v_player.role = any (public.open_roles(v_team.id))) then
    raise exception 'ROLE_FILLED: team already has that role filled';
  end if;
  if p_price > v_team.points_remaining then
    raise exception 'INSUFFICIENT_POINTS: price exceeds team points';
  end if;
  if p_acquisition is null or p_acquisition not in ('captain', 'free_agency') then
    raise exception 'SETUP_ACQUISITION_INVALID: setup acquisition must be captain or free_agency';
  end if;
  if exists (
    select 1 from public.players
    where team_id = v_team.id and acquisition = p_acquisition::public.acquisition_type
  ) then
    raise exception 'SETUP_ACQUISITION_TAKEN: team already has this setup acquisition';
  end if;

  update public.players
    set team_id = v_team.id,
        price = p_price,
        acquisition = p_acquisition::public.acquisition_type
    where id = v_player.id;
  update public.teams
    set points_remaining = points_remaining - p_price
    where id = v_team.id;
end $$;

revoke all on function public.admin_assign_setup_player(uuid, uuid, uuid, int, text)
  from public;
grant execute on function public.admin_assign_setup_player(uuid, uuid, uuid, int, text)
  to authenticated, service_role;

create or replace function public.admin_reorder_setup_teams(
  p_draft_id uuid,
  p_team_ids uuid[]
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_len int;
  v_distinct int;
  v_total int;
begin
  if not public.is_owner() then
    raise exception 'NOT_OWNER: owner access required';
  end if;
  select * into v_draft from public.drafts
    where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  v_len := coalesce(cardinality(p_team_ids), 0);
  if v_len = 0 then
    raise exception 'ORDER_INVALID: order lists no teams';
  end if;
  if exists (select 1 from unnest(p_team_ids) as t(id) where t.id is null) then
    raise exception 'ORDER_INVALID: order contains a null team';
  end if;
  select count(distinct t.id) into v_distinct from unnest(p_team_ids) as t(id);
  if v_distinct <> v_len then
    raise exception 'ORDER_INVALID: order repeats a team';
  end if;

  -- Lock every team in the draft, then require the order to name each of them
  -- exactly once. A partial order would otherwise renumber a subset on top of
  -- positions still held by the teams it left out.
  perform 1 from public.teams
    where draft_id = p_draft_id order by id for update;
  select count(*) into v_total from public.teams where draft_id = p_draft_id;
  if v_total <> v_len or exists (
    select 1 from unnest(p_team_ids) as t(id)
      where not exists (
        select 1 from public.teams x
          where x.id = t.id and x.draft_id = p_draft_id
      )
  ) then
    raise exception 'ORDER_INVALID: order must list every team in this draft exactly once';
  end if;

  -- Two passes: a straight renumber trips the unique index as soon as any two
  -- teams trade places, so park every row on a negative slot first (no live
  -- position is ever negative) and then land them on their final 1..n slots.
  update public.teams t
    set nomination_position = (-o.ord)::int
    from unnest(p_team_ids) with ordinality as o(id, ord)
    where t.id = o.id;

  update public.teams t
    set nomination_position = o.ord::int
    from unnest(p_team_ids) with ordinality as o(id, ord)
    where t.id = o.id;
end $$;

revoke all on function public.admin_reorder_setup_teams(uuid, uuid[]) from public;
grant execute on function public.admin_reorder_setup_teams(uuid, uuid[])
  to authenticated, service_role;
