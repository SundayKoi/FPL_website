-- Drag-to-reorder the nomination order during setup.
--
-- The old admin UI let you type a position per team, which the unique
-- (draft_id, nomination_position) index rejects the moment two teams would
-- share a number — i.e. every ordinary swap. This RPC takes the whole intended
-- order at once so the renumber is atomic and always lands on 1..n.

create function public.admin_reorder_setup_teams(
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
  perform public._require_admin();
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
