alter table public.teams
  add column captain_profile_id_2 uuid references public.profiles(id);

create unique index teams_second_captain_per_draft
  on public.teams (draft_id, captain_profile_id_2)
  where captain_profile_id_2 is not null;

alter table public.teams
  add constraint teams_distinct_captains
  check (captain_profile_id_2 is null or captain_profile_id_2 <> captain_profile_id);

create or replace function public.teams_enforce_captain_uniqueness() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_conflict_profile uuid;
begin
  select captain_profile
    into v_conflict_profile
  from (
    values (new.captain_profile_id), (new.captain_profile_id_2)
  ) as proposed(captain_profile)
  where captain_profile is not null
    and exists (
      select 1
      from public.teams t
      where t.draft_id = new.draft_id
        and t.id <> new.id
        and (
          t.captain_profile_id = proposed.captain_profile
          or t.captain_profile_id_2 = proposed.captain_profile
        )
    )
  limit 1;

  if v_conflict_profile is not null then
    raise exception 'CAPTAIN_CONFLICT: captain profile is already assigned to another team in this draft';
  end if;

  return new;
end $$;

create trigger teams_enforce_captain_uniqueness
before insert or update of draft_id, captain_profile_id, captain_profile_id_2
on public.teams
for each row
execute function public.teams_enforce_captain_uniqueness();

create or replace function public.caller_team(p_draft_id uuid) returns public.teams
language plpgsql stable security definer set search_path = public as $$
declare v_team public.teams;
begin
  select t.* into v_team from public.teams t
  where t.draft_id = p_draft_id
    and (
      t.captain_profile_id = auth.uid()
      or t.captain_profile_id_2 = auth.uid()
    );
  if not found then
    raise exception 'NOT_CAPTAIN: you are not a captain in this draft';
  end if;
  return v_team;
end $$;

create or replace function public.nemesis_pick(
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
     and not coalesce(
       v_chooser.captain_profile_id = auth.uid()
       or v_chooser.captain_profile_id_2 = auth.uid(),
       false
     ) then
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
