-- Setup no longer requires a free agent per team: a captain alone is enough.
-- Teams may pre-fill 1 role (captain) or 2 (captain + free agent) — the old
-- rule demanded exactly 2. The per-role pool check below adapts per team, so
-- captain-only teams simply need one more player available in each open role.

create or replace function public.start_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_bad text;
  r public.lol_role;
  v_need int; v_have int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found or v_draft.status <> 'setup' then
    raise exception 'SETUP_INVALID: draft is not in setup';
  end if;

  if (select count(*) from public.teams where draft_id = p_draft_id) < 2 then
    raise exception 'SETUP_INVALID: need at least 2 teams';
  end if;

  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and t.captain_profile_id is null;
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams missing captains: %', v_bad;
  end if;

  -- 1 or 2 pre-filled roles per team (captain required, free agent optional)
  select string_agg(t.name, ', ') into v_bad from public.teams t
    where t.draft_id = p_draft_id and cardinality(public.open_roles(t.id)) not in (3, 4);
  if v_bad is not null then
    raise exception 'SETUP_INVALID: teams need a captain and at most one free agent pre-filled: %', v_bad;
  end if;

  foreach r in array enum_range(null::public.lol_role) loop
    select count(*) into v_need from public.teams t
      where t.draft_id = p_draft_id and r = any(public.open_roles(t.id));
    select count(*) into v_have from public.players p
      where p.draft_id = p_draft_id and p.role = r and p.team_id is null;
    if v_have < v_need then
      raise exception 'SETUP_INVALID: pool has % % players but % teams need one', v_have, r, v_need;
    end if;
  end loop;

  update public.drafts
    set status = 'live',
        current_round = 1,
        current_nominator_team_id = (
          select id from public.teams where draft_id = p_draft_id
          order by nomination_position asc limit 1)
    where id = p_draft_id;
end $$;
