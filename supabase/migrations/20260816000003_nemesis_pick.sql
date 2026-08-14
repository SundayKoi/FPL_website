-- One nemesis pick. The team on the clock is whoever was chosen last, and the
-- division is simply the opposite of that pick's side, so the chain alternates
-- and a 12-team league lands 6-6 without any cap logic.

create function public.nemesis_pick(
  p_draft_id uuid,
  p_chosen_team_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_draft public.drafts;
  v_last public.nemesis_picks;
  v_chooser public.teams;
  v_chosen public.teams;
  v_team_count int;
  v_pick_count int;
  v_division text;
  v_lunari text;
  v_solari text;
begin
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

  select count(*) into v_team_count from public.teams where draft_id = p_draft_id;
  select count(*) into v_pick_count from public.nemesis_picks where draft_id = p_draft_id;
  if v_pick_count >= v_team_count then
    raise exception 'NEMESIS_COMPLETE: every team is already placed';
  end if;

  select * into v_chooser from public.teams where id = v_last.chosen_team_id;
  -- Fail closed like every other captain gate (see caller_team()): a plain
  -- `is distinct from` treats "both null" as equal, which would let an
  -- unauthenticated caller (auth.uid() null) pick for a captainless team
  -- (nemesis_start allows seeding one). coalesce(..., false) denies that case.
  if not public.is_admin()
     and not coalesce(v_chooser.captain_profile_id = auth.uid(), false) then
    raise exception 'NOT_YOUR_TURN: it is not your turn to pick';
  end if;

  select * into v_chosen from public.teams
    where id = p_chosen_team_id and draft_id = p_draft_id for update;
  if not found then
    raise exception 'TEAM_INVALID: team is not in this draft';
  end if;
  -- Covers picking yourself too: the chooser was placed by an earlier pick.
  if exists (
    select 1 from public.nemesis_picks
      where draft_id = p_draft_id and chosen_team_id = p_chosen_team_id
  ) then
    raise exception 'TEAM_PLACED: that team already has a division';
  end if;

  v_division := case when v_last.division = 'Lunari' then 'Solari' else 'Lunari' end;

  insert into public.nemesis_picks
    (draft_id, pick_number, chooser_team_id, chosen_team_id, division)
    values (p_draft_id, v_last.pick_number + 1, v_chooser.id, v_chosen.id, v_division);
  update public.teams set division = v_division where id = v_chosen.id;

  perform public._draft_system_message(p_draft_id,
    '🗡️ ' || v_chooser.name || ' sent ' || v_chosen.name || ' to ' || v_division);

  if v_pick_count + 1 = v_team_count then
    select string_agg(t.name, ', ' order by np.pick_number) into v_lunari
      from public.nemesis_picks np join public.teams t on t.id = np.chosen_team_id
      where np.draft_id = p_draft_id and np.division = 'Lunari';
    select string_agg(t.name, ', ' order by np.pick_number) into v_solari
      from public.nemesis_picks np join public.teams t on t.id = np.chosen_team_id
      where np.draft_id = p_draft_id and np.division = 'Solari';
    perform public._draft_system_message(p_draft_id,
      '🏁 Nemesis draft complete — Lunari: ' || coalesce(v_lunari, '—') ||
      ' · Solari: ' || coalesce(v_solari, '—'));
  end if;
end $$;

revoke all on function public.nemesis_pick(uuid, uuid) from public;
grant execute on function public.nemesis_pick(uuid, uuid)
  to authenticated, service_role;
