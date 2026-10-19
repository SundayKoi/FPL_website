-- Offseason MVP nominees (see docs/offseason.md): staff pick the two to five
-- players a week's MVP vote is between, and members vote for one of them.
-- 20261113000002 let members vote for anyone who played that week.
--
-- Voting still opens when the week is complete and closes when the next week
-- plays (_offseason_mvp_open_week, 20261115000001); until staff name the
-- nominees there is nobody to vote for. Changing the nominees drops the votes
-- of anyone no longer nominated, so those voters choose again.

create table public.offseason_mvp_nominees (
  week_id    uuid not null references public.offseason_weeks(id) on delete cascade,
  entrant_id uuid not null references public.offseason_entrants(id) on delete cascade,
  -- The order staff listed them in, which is the order they're shown.
  position   int not null check (position between 1 and 5),
  primary key (week_id, entrant_id),
  unique (week_id, position)
);

alter table public.offseason_mvp_nominees enable row level security;

revoke all on public.offseason_mvp_nominees from anon, authenticated;
grant select on public.offseason_mvp_nominees to anon, authenticated;
grant all on public.offseason_mvp_nominees to service_role;

create policy offseason_mvp_nominees_public_read on public.offseason_mvp_nominees
  for select using (true);

-- Replaces a week's nominees: two to five of its players, in display order,
-- or none to clear them.
create function public.offseason_set_mvp_nominees(p_week_id uuid, p_entrant_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_week public.offseason_weeks;
  v_ids uuid[] := coalesce(p_entrant_ids, '{}');
  v_count int;
begin
  perform public._offseason_require_staff();
  -- Holds off votes on this week until the new nominees are in.
  select * into v_week from public.offseason_weeks where id = p_week_id for update;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  v_count := cardinality(v_ids);
  if (select count(distinct id) from unnest(v_ids) as picked(id)) <> v_count then
    raise exception 'NOMINEES_INVALID: a player is nominated twice';
  end if;
  if v_count <> 0 and v_count not between 2 and 5 then
    raise exception 'NOMINEES_INVALID: nominate two to five players';
  end if;
  if exists (
    select 1 from unnest(v_ids) as picked(id)
    where not exists (
      select 1 from public.offseason_team_members m
      join public.offseason_teams t on t.id = m.team_id
      where t.week_id = v_week.id and m.entrant_id = picked.id
    )
  ) then
    raise exception 'NOT_PLAYING: every nominee must have played in week %', v_week.week_number;
  end if;

  delete from public.offseason_mvp_votes
   where week_id = v_week.id and entrant_id <> all (v_ids);
  delete from public.offseason_mvp_nominees where week_id = v_week.id;
  insert into public.offseason_mvp_nominees (week_id, entrant_id, position)
  select v_week.id, picked.id, picked.n
  from unnest(v_ids) with ordinality as picked(id, n);
end $$;

revoke all on function public.offseason_set_mvp_nominees(uuid, uuid[]) from public, anon;
grant execute on function public.offseason_set_mvp_nominees(uuid, uuid[]) to authenticated;

-- Casts or changes the caller's vote for a week's MVP: one of its nominees,
-- never themselves. Unchanged from 20261113000002 but for the nominee check
-- and the share lock that waits out a change of nominees.
create or replace function public.offseason_vote_mvp(p_week_id uuid, p_entrant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_week public.offseason_weeks;
  v_entrant public.offseason_entrants;
begin
  if v_uid is null then
    raise exception 'NOT_SIGNED_IN: sign in to vote';
  end if;
  select * into v_week from public.offseason_weeks where id = p_week_id for share;
  if not found then
    raise exception 'WEEK_NOT_FOUND: no such week';
  end if;
  if public._offseason_mvp_open_week(v_week.event_id) is distinct from v_week.id then
    raise exception 'VOTING_CLOSED: voting on week % is closed', v_week.week_number;
  end if;
  select * into v_entrant from public.offseason_entrants where id = p_entrant_id and event_id = v_week.event_id;
  if not found or not exists (
    select 1 from public.offseason_team_members m
    join public.offseason_teams t on t.id = m.team_id
    where t.week_id = v_week.id and m.entrant_id = v_entrant.id
  ) then
    raise exception 'NOT_PLAYING: they did not play in week %', v_week.week_number;
  end if;
  if not exists (
    select 1 from public.offseason_mvp_nominees n where n.week_id = v_week.id and n.entrant_id = v_entrant.id
  ) then
    raise exception 'NOT_NOMINATED: vote for one of week %''s nominees', v_week.week_number;
  end if;
  if v_entrant.profile_id = v_uid then
    raise exception 'SELF_VOTE: you can''t vote for yourself';
  end if;

  insert into public.offseason_mvp_votes (week_id, voter_id, entrant_id)
  values (v_week.id, v_uid, v_entrant.id)
  on conflict (week_id, voter_id) do update
    set entrant_id = excluded.entrant_id, voted_at = now();
end $$;
