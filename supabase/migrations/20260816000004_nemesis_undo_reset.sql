-- Admin corrections. Because the clock is derived from the last pick, undo is
-- a plain delete -- there is no turn pointer to rewind separately.

create function public.nemesis_undo(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_last public.nemesis_picks;
  v_chosen public.teams;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  select * into v_last from public.nemesis_picks
    where draft_id = p_draft_id
    order by pick_number desc limit 1;
  if not found then
    raise exception 'NEMESIS_NOT_STARTED: the nemesis draft has not started';
  end if;
  if v_last.pick_number = 0 then
    raise exception 'NEMESIS_SEED: reset the nemesis draft to change who starts';
  end if;

  select * into v_chosen from public.teams where id = v_last.chosen_team_id for update;
  update public.teams set division = null where id = v_last.chosen_team_id;
  delete from public.nemesis_picks where id = v_last.id;

  perform public._draft_system_message(p_draft_id,
    '↩️ Admin undid the nemesis pick of ' || v_chosen.name);
end $$;

create function public.nemesis_reset(p_draft_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
begin
  perform public._require_admin();
  select * into v_draft from public.drafts where id = p_draft_id for update;
  if not found then
    raise exception 'DRAFT_INVALID: draft not found';
  end if;

  delete from public.nemesis_picks where draft_id = p_draft_id;
  update public.teams set division = null where draft_id = p_draft_id;

  perform public._draft_system_message(p_draft_id,
    '🔄 Admin reset the nemesis draft — every division is cleared');
end $$;

revoke all on function public.nemesis_undo(uuid) from public;
revoke all on function public.nemesis_reset(uuid) from public;
grant execute on function public.nemesis_undo(uuid) to authenticated, service_role;
grant execute on function public.nemesis_reset(uuid) to authenticated, service_role;
