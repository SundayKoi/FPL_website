-- Offseason: a week where everyone plays the elimination tier (see
-- docs/offseason.md). With four teams' worth of players left there is no main
-- tier, so importing the elimination draft has to start the week's play;
-- before this only the main import did. The function is otherwise unchanged
-- from 20261107000001_offseason_tournament.sql. CREATE OR REPLACE keeps its
-- grants.

create or replace function public.offseason_import_week_draft(p_week_id uuid, p_tier text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_draft uuid;
  v_team record;
  v_new uuid;
  v_count int := 0;
begin
  perform public._offseason_require_staff();
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  v_draft := case p_tier when 'main' then v_week.main_draft_id when 'elimination' then v_week.elimination_draft_id end;
  if v_draft is null then
    raise exception 'DRAFT_MISSING: week % has no % draft', v_week.week_number, coalesce(p_tier, '?');
  end if;
  if exists (select 1 from public.offseason_teams where week_id = p_week_id and tier = p_tier) then
    raise exception 'ALREADY_IMPORTED: the % teams for week % are already in', p_tier, v_week.week_number;
  end if;
  if exists (
    select 1 from public.teams t
    where t.draft_id = v_draft and cardinality(public.open_roles(t.id)) > 0
  ) then
    raise exception 'DRAFT_NOT_FINISHED: every team needs all five roles first';
  end if;

  for v_team in
    select t.* from public.teams t where t.draft_id = v_draft order by t.nomination_position
  loop
    insert into public.offseason_teams (week_id, tier, name, captain_entrant_id, draft_team_id)
    values (
      p_week_id, p_tier, v_team.name,
      (select l.entrant_id from public.players p
         join public.offseason_draft_links l on l.draft_player_id = p.id
        where p.team_id = v_team.id and p.acquisition = 'captain' limit 1),
      v_team.id
    )
    returning id into v_new;
    insert into public.offseason_team_members (team_id, entrant_id, role, price)
    select v_new, l.entrant_id, p.role, p.price
    from public.players p
    join public.offseason_draft_links l on l.draft_player_id = p.id
    where p.team_id = v_team.id;
    v_count := v_count + 1;
  end loop;

  -- The week plays once its main tier is in, or once its only tier is: from
  -- the week four teams are left, everyone plays the elimination tier.
  if p_tier = 'main' or v_week.main_draft_id is null then
    update public.offseason_weeks set status = 'playing' where id = p_week_id;
  end if;
  return v_count;
end $$;
