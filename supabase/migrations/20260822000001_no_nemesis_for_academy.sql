-- Academy runs a single division, so it holds no nemesis draft after its
-- auction. The board hides it, and this stops the RPC being reached anyway.

create or replace function public.nemesis_start(
  p_draft_id uuid,
  p_team_id uuid,
  p_division text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_team public.teams;
  v_team_count int;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;
  if p_draft_id = (select academy_draft_id from public.league_settings where id = 1) then
    raise exception 'NEMESIS_INVALID: Academy has one division and no nemesis draft';
  end if;
  if v_draft.status <> 'complete' then
    raise exception 'NEMESIS_INVALID: finish the auction draft first';
  end if;
  if p_division is null or p_division not in ('Lunari', 'Solari') then
    raise exception 'DIVISION_INVALID: division must be Lunari or Solari';
  end if;
  if exists (select 1 from public.nemesis_picks where draft_id = p_draft_id) then
    raise exception 'NEMESIS_INVALID: the nemesis draft has already started';
  end if;

  select count(*) into v_team_count from public.teams where draft_id = p_draft_id;
  if v_team_count < 2 then
    raise exception 'NEMESIS_INVALID: need at least 2 teams';
  end if;

  select * into v_team from public.teams
    where id = p_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;

  -- Divisions may have been set by hand before; the chain owns them now.
  update public.teams set division = null where draft_id = p_draft_id;

  insert into public.nemesis_picks
    (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
    values (p_draft_id, 0, null, v_team.id, p_division);
  update public.teams set division = p_division where id = v_team.id;

  perform public._draft_system_message(p_draft_id,
    '🗡️ Nemesis draft — ' || v_team.name || ' starts in ' || p_division || ' and picks first');
end $$;
